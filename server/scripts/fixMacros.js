#!/usr/bin/env node
/**
 * Fix/sanity-check nutrition macros for all recipes in an index using a stronger LLM (Groq).
 * - Streams through the index with scroll
 * - Sends groups of docs to the LLM to return sensible macros
 * - Bulk-updates nutrition fields in Elasticsearch
 *
 * Usage:
 *   node server/scripts/fixMacros.js --index recipes_sample --batch-size 200 --group-size 5 --model llama-3.1-70b-versatile
 *
 * Env:
 *   GROQ_API_KEY (required)
 *   ELASTICSEARCH_NODE, ELASTICSEARCH_RECIPE_INDEX (fallback)
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
const batchSize = Number(getArg('batch-size', 200));
const groupSize = Number(getArg('group-size', 5));
const model = getArg('model', process.env.GROQ_MODEL || 'llama-3.1-70b-versatile');
const maxDocs = Number(getArg('limit', 0)); // optional cap

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
You are a nutrition QA assistant. For each recipe, adjust macros to sensible per-serving values (calories, protein, carbs, fat, fiber, sugar). If a value looks zero/clearly wrong, fix it. Return ONLY JSON array of:
{ "id": "<id>", "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number }
No markdown, no extra fields.
Recipes:
${JSON.stringify(payload)}
`.trim();
};

const fetchScroll = async (scrollId) => {
  if (!scrollId) {
    return client.search({
      index,
      size: batchSize,
      scroll: '2m',
      _source: ['title', 'ingredients_raw', 'ingredients_parsed', 'instructions', 'nutrition']
    });
  }
  return client.scroll({ scroll_id: scrollId, scroll: '2m' });
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

      for (let i = 0; i < slice.length; i += groupSize) {
        const group = slice.slice(i, i + groupSize);
        const prompt = buildPrompt(group);
        const { content } = await groqChat({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'Return pure JSON only.' },
            { role: 'user', content: prompt }
          ]
        });
        let parsed = [];
        try {
          const cleaned = content.replace(/```json|```/gi, '').trim();
          parsed = JSON.parse(cleaned);
        } catch (err) {
          console.warn('⚠️ Failed to parse LLM response, skipping group:', err.message);
          continue;
        }
        const updates = [];
        parsed.forEach((row) => {
          if (!row?.id) return;
          const norm = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
          updates.push({
            id: row.id,
            nutrition: {
              calories: norm(row.calories),
              protein: norm(row.protein),
              carbs: norm(row.carbs),
              fat: norm(row.fat),
              fiber: norm(row.fiber),
              sugar: norm(row.sugar)
            }
          });
        });
        if (updates.length) {
          await bulkUpdate(updates);
          console.log(`✅ Updated ${updates.length} docs`);
        }
        await sleep(200); // small pause to be gentle on API
      }

      processed += slice.length;
      console.log(`Processed ${processed} docs...`);
      if (maxDocs > 0 && processed >= maxDocs) break;
    }
    console.log('Done.');
  } catch (err) {
    console.error('Error running macro fix:', err);
    process.exit(1);
  }
})();
