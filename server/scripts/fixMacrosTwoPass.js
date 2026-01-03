#!/usr/bin/env node
/**
 * Two-pass macro fixer:
 * 1) Scan the index for "suspicious" docs (missing/zero calories or protein).
 * 2) Send only those docs to a cheaper LLM (default Groq llama-3.3-8b) in batches to regenerate sensible macros.
 * 3) Bulk update nutrition back into Elasticsearch.
 *
 * Usage:
 *   node server/scripts/fixMacrosTwoPass.js --index recipes_sample --batch-size 300 --group-size 6 --model llama-3.3-8b-instant
 *
 * Env:
 *   GROQ_API_KEY (required)
 *   ELASTICSEARCH_NODE / ELASTICSEARCH_RECIPE_INDEX (fallback)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { client } = require('../services/recipeSearch/elasticsearchClient');
const { groqChat } = require('../services/groqClient');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
};

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is required');
  process.exit(1);
}

const index = getArg('index', process.env.ELASTICSEARCH_RECIPE_INDEX || 'recipes_sample');
const batchSize = Number(getArg('batch-size', 300));
const groupSize = Number(getArg('group-size', 6));
const model = getArg('model', 'llama-3.3-8b-instant');
const maxDocs = Number(getArg('limit', 0)); // optional cap on total processed
const scrollKeepAlive = getArg('scroll', '5m'); // keep-alive for scroll context
const concurrency = Number(getArg('concurrency', 2));
const retryBackoffs = [10_000, 20_000, 40_000];

const sanitizeAscii = (str = '') =>
  String(str)
    .replace(/\u2026/g, '...') // ellipsis
    .replace(/[^\x00-\x7F]/g, ''); // strip remaining non-ASCII

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isSuspicious = (src = {}) => {
  // Only enforce non-zero on the main nutrition fields; ignore *_g variants
  const fields = [
    Number(src.nutrition?.calories ?? src.calories ?? 0),
    Number(src.nutrition?.protein ?? src.protein ?? 0),
    Number(src.nutrition?.carbs ?? src.carbs ?? 0),
    Number(src.nutrition?.fat ?? src.fat ?? 0),
    Number(src.nutrition?.fiber ?? src.fiber ?? 0),
    Number(src.nutrition?.sugar ?? src.sugar ?? 0)
  ];
  const suspicious = fields.some((v) => !Number.isFinite(v) || v <= 0);
  return { suspicious, fields };
};

const buildPrompt = (docs) => {
  const payload = docs.map((d) => {
    const src = d._source || {};
    return {
      id: d._id,
      title: src.title,
      ingredients: src.ingredients_raw || src.ingredients_parsed,
      instructions: src.instructions,
      nutrition: src.nutrition
    };
  });
  return `
You are a nutrition QA assistant. For each recipe below, output sensible per-serving macros (calories, protein, carbs, fat, fiber, sugar).
If an input macro is zero/missing/wrong, fix it with reasonable estimates based on the dish.
Return ONLY JSON array of:
[
  { "id": "<id>", "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number }
]
No markdown or prose.
Recipes:
${JSON.stringify(payload)}
`.trim();
};

const fetchScroll = async (scrollId) => {
  if (!scrollId) {
    return client.search({
      index,
      size: batchSize,
      scroll: scrollKeepAlive,
      _source: ['title', 'ingredients_raw', 'ingredients_parsed', 'instructions', 'nutrition', 'calories', 'protein', 'protein_g', 'protein_grams']
    });
  }
  return client.scroll({ scroll_id: scrollId, scroll: scrollKeepAlive });
};

const bulkUpdate = async (updates) => {
  if (!updates.length) return;
  const body = [];
  updates.forEach((u) => {
    body.push({ update: { _index: index, _id: u.id } });
    body.push({ doc: { nutrition: u.nutrition } });
  });
  await client.bulk({ body, refresh: false });
};

// Run handlers with limited concurrency
const runWithConcurrency = async (items, limit, handler) => {
  const results = [];
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (i < items.length) {
      const current = items[i++];
      try {
        const r = await handler(current);
        results.push(r);
      } catch (err) {
        console.warn('⚠️ Handler error:', err.message);
      }
    }
  });
  await Promise.all(workers);
  return results;
};

(async () => {
  try {
    let processed = 0;
    let scrollId = null;
    while (true) {
      const res = await fetchScroll(scrollId);
      scrollId = res._scroll_id;
      const hits = res.hits?.hits || [];
      if (!hits.length) break;
      const capped = maxDocs > 0 ? Math.max(maxDocs - processed, 0) : hits.length;
      const slice = maxDocs > 0 ? hits.slice(0, capped) : hits;
      if (!slice.length) break;

      // Filter to suspicious docs to reduce LLM calls
      const suspects = slice.filter((h) => isSuspicious(h._source).suspicious);
      if (!suspects.length) {
        console.log(`📦 Batch skipped: all macros non-zero (${slice.length} docs)`);
      } else if (suspects.length < slice.length) {
        console.log(`ℹ️ Skipped ${slice.length - suspects.length} docs in batch (already non-zero macros)`);
      }
      if (!suspects.length) {
        processed += slice.length;
        console.log(`Skipped batch (no suspicious docs). Total processed: ${processed}`);
        continue;
      }

      const groups = [];
      for (let i = 0; i < suspects.length; i += groupSize) {
        groups.push(suspects.slice(i, i + groupSize));
      }

      await runWithConcurrency(groups, concurrency, async (group) => {
        const prompt = buildPrompt(group);
        let parsed = [];
        try {
          const promptSafe = sanitizeAscii(prompt);
          let content;
          let lastErr;
          for (let attempt = 0; attempt < retryBackoffs.length; attempt += 1) {
            try {
              const resp = await groqChat({
                model,
                temperature: 0.2,
                messages: [
                  { role: 'system', content: 'Return pure JSON only.' },
                  { role: 'user', content: promptSafe }
                ]
              });
              content = resp.content;
              break;
            } catch (err) {
              lastErr = err;
              if (err?.message?.includes('Rate limit') && attempt < retryBackoffs.length - 1) {
                const delay = retryBackoffs[attempt];
                console.warn(`⚠️ Rate limit hit, waiting ${delay / 1000}s (attempt ${attempt + 1}/${retryBackoffs.length})...`);
                await sleep(delay);
                continue;
              }
              throw err;
            }
          }
          if (!content && lastErr) throw lastErr;
          // Replace non-ASCII chars (e.g., ellipsis) with safe equivalents before parsing
          let cleaned = content.replace(/```json|```/gi, '').trim();
          cleaned = sanitizeAscii(cleaned);
          parsed = JSON.parse(cleaned);
        } catch (err) {
          console.warn('⚠️ Failed to parse LLM response, skipping group:', err.message);
          return;
        }
        const updates = [];
        parsed.forEach((row) => {
          if (!row?.id) return;
          const norm = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
          const newNut = {
            calories: norm(row.calories),
            protein: norm(row.protein),
            carbs: norm(row.carbs),
            fat: norm(row.fat),
            fiber: norm(row.fiber),
            sugar: norm(row.sugar)
          };
          const src = group.find((g) => g._id === row.id)?._source || {};
          const oldNut = src.nutrition || {};
          console.log(
            `🔁 ${row.id}: cal ${oldNut.calories || 0} -> ${newNut.calories}, ` +
            `protein ${oldNut.protein || 0} -> ${newNut.protein}, ` +
            `carbs ${oldNut.carbs || 0} -> ${newNut.carbs}, ` +
            `fat ${oldNut.fat || 0} -> ${newNut.fat}, ` +
            `fiber ${oldNut.fiber || 0} -> ${newNut.fiber}, ` +
            `sugar ${oldNut.sugar || 0} -> ${newNut.sugar}`
          );
          updates.push({
            id: row.id,
            nutrition: newNut
          });
        });
        if (updates.length) {
          await bulkUpdate(updates);
          console.log(`✅ Updated ${updates.length} docs`);
        }
        await sleep(150); // be gentle on API
      });

      processed += slice.length;
      console.log(`Processed ${processed} docs (suspects this batch: ${suspects.length})...`);
      if (maxDocs > 0 && processed >= maxDocs) break;
    }
    console.log('Done.');
  } catch (err) {
    console.error('Error running two-pass macro fix:', err);
    process.exit(1);
  }
})();
