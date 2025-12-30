#!/usr/bin/env node
/**
 * Enrich recipes in Elasticsearch using a local Ollama model (default) or Groq (llama-3.1-8b-instant).
 * - Streams through the recipes index in batches (scroll).
 * - Sends each doc to Ollama for structured fields.
 * - Bulk-updates ES with the enriched fields.
 *
 * Usage:
 *   node server/scripts/enrichWithOllama.js --batch-size 100 --model mistral:7b
 *
 * Env overrides:
 *   ENRICH_PROVIDER (ollama|groq, default ollama)
 *   OLLAMA_HOST (default http://localhost:11434)
 *   OLLAMA_MODEL (default mistral:7b)
 *   GROQ_API_KEY (required if provider=groq)
 *   GROQ_MODEL (default llama-3.1-8b-instant)
 *   ELASTICSEARCH_NODE / ELASTICSEARCH_RECIPE_INDEX (from existing config)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { client, recipeIndex } = require('../services/recipeSearch/elasticsearchClient');
const { groqChat } = require('../services/groqClient');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
};

const batchSize = Number(getArg('batch-size', 500)); // ES scroll size
const groupSize = Number(getArg('group-size', 1)); // recipes per prompt
const concurrency = Number(getArg('concurrency', 3));
const verbose = getArg('verbose', 'false') === 'true';
const scrollKeepAlive = getArg('scroll-keep', '5m'); // keep-alive for scroll context
const hostsArg = getArg('ollama-hosts', '');
const ollamaHosts = (hostsArg || process.env.OLLAMA_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
const defaultHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const hostPool = ollamaHosts.length ? ollamaHosts : [defaultHost];
let hostCursor = 0;
const provider = getArg('provider', process.env.ENRICH_PROVIDER || 'ollama');
const model = getArg('model', process.env.OLLAMA_MODEL || 'mistral:7b');
const groqModel = getArg('groq-model', process.env.GROQ_MODEL || 'llama-3.1-8b-instant');
const maxDocs = Number(getArg('limit', 0)); // optional cap for testing
// Pick the target index: CLI flag wins, then env, then safe default recipes_sample_v2
const targetIndex = getArg('index', process.env.ELASTICSEARCH_RECIPE_INDEX || 'recipes_sample_v2');
const skipEnriched = getArg('skip-enriched', 'true') === 'true';
// Optional embedding generation (e.g., with Ollama /api/embeddings)
const withEmbedding = getArg('with-embedding', process.env.WITH_EMBEDDING || 'false') === 'true';
// Default to a 768-dim model to match the current mapping
const embeddingModel = getArg('embedding-model', process.env.EMBEDDING_MODEL || 'nomic-embed-text');
const embeddingHost = getArg('embedding-host', process.env.EMBEDDING_HOST || defaultHost);
const logTiming = getArg('log-timing', process.env.LOG_TIMING || 'false') === 'true';
const groqRetries = Number(getArg('groq-retries', process.env.GROQ_RETRIES || 3));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildPromptForGroup = (hits) => {
  const payload = hits.map((hit) => {
    const src = hit._source || {};
    return {
      id: hit._id,
      title: src.title || '',
      ingredients: src.ingredients_raw && src.ingredients_raw.trim()
        ? src.ingredients_raw
        : (Array.isArray(src.ingredients_norm) && src.ingredients_norm.length ? src.ingredients_norm : ''),
      directions: src.instructions || ''
    };
  });

  return `
-You are enriching recipe metadata. Act as a pure JSON API.
-Return ONLY a valid JSON array, one object per input, in the same order. No code, no markdown, no prose.
-
-For each recipe, output:
- id: copy from input
- cuisine: one word, lowercase, mandatory field
- course: one of [starter, main, dessert, side, drink, other], mandatory field
- meal_type: array of any of [breakfast, lunch, dinner, snack], mandatory field
- diet_tags: array from [balanced, vegetarian, vegan, keto, paleo, low_carb, high_protein, gluten_free, dairy_free, nut_free]. Pick the best-fit tags; only use balanced when nothing else fits. If the dish is clearly junk/fried/indulgent and does not fit a diet, leave diet_tags empty. Only apply a tag when the ingredients/instructions support it (e.g., no meat for vegetarian, no animal products for vegan, low starch/sugar for low_carb, protein-forward for high_protein).
- allergens: array from [gluten, dairy, eggs, fish, shellfish, soy, nuts, peanuts, sesame]
- activity_fit: one of [low_activity, moderate_activity, high_activity] based on how hearty/protein-heavy the dish is
- goal_fit: one of [weight_loss, weight_maintenance, weight_gain] based on calories/macros; use weight_maintenance for typical balanced meals
- difficulty: one of [easy, medium, hard]
- servings: integer or null
- ingredients_parsed: array of objects {name, amount, unit, category} where category is one of [protein, vegetable, fruit, grain, dairy, fat, spice, nut, seed, other]. Parse quantities sensibly; if unknown, set amount \"1\" and unit \"unit\" and category \"other\".
- prep_time_min, cook_time_min, total_time_min: integers , mandatory filed
- nutrition: { calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g } numbers (per serving, approximate), mandatory field
- high_protein: boolean, mandatory field
- low_carb: boolean, mandatory field
- kid_friendly: boolean
- quick: boolean (true if total_time_min <= 30), mandatory field
- one_pot: boolean, mandatory field

If unsure, use null, empty array, or false. Do NOT include comments or extra fields.

INPUT:
${JSON.stringify(payload)}
  `.trim();
};

const pickHost = () => {
  const host = hostPool[hostCursor % hostPool.length];
  hostCursor += 1;
  return host;
};

const callOllama = async (prompt) => {
  const host = pickHost();
  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data?.response || '';
};

const parseRetryDelayMs = (message) => {
  if (!message) return 1000;
  const match = message.match(/try again in\s+([\d.]+)\s*(ms|milliseconds|s|sec|seconds)/i);
  if (!match) return 1000;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return 1000;
  const unit = match[2].toLowerCase();
  const ms = unit.startsWith('s') && unit !== 'ms' ? value * 1000 : value;
  return Math.max(250, Math.min(ms, 10000));
};

const callGroq = async (prompt) => {
  let attempt = 0;
  let lastError;
  const backoff = [5000, 10000, 20000];
  while (attempt < groqRetries) {
    try {
      const { content } = await groqChat({
        model: groqModel,
        temperature: 0.2,
        maxTokens: 2048,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that ONLY returns JSON as instructed.' },
          { role: 'user', content: prompt }
        ]
      });
      return content;
    } catch (err) {
      lastError = err;
      const isRateLimit = err?.status === 429 || /rate limit/i.test(err?.message || '');
      if (isRateLimit && attempt < groqRetries - 1) {
        const parsedDelay = parseRetryDelayMs(err?.message || '');
        const enforcedDelay = backoff[attempt] || parsedDelay;
        const delay = Math.max(parsedDelay, enforcedDelay);
        console.warn(`⏳ Groq rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${groqRetries})`);
        await sleep(delay);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

const callLLM = async (prompt) => {
  if (provider === 'groq') {
    return callGroq(prompt);
  }
  return callOllama(prompt);
};

const extractJson = (text) => {
  if (!text) return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence) return fence[1];
  // Try to find an array block first
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    return text.slice(arrStart, arrEnd + 1);
  }
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return text.slice(objStart, objEnd + 1);
  }
  return null;
};

const parseResponse = (text) => {
  const jsonString = extractJson(text) || text;
  try {
    // Strip comments to be tolerant of non-strict JSON
    const cleaned = jsonString
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (err) {
    return null;
  }
};

const updateBatch = async (docs) => {
  const body = [];
  docs.forEach(({ id, enrich, base }) => {
    body.push({ update: { _index: targetIndex, _id: id } });
    body.push({
      doc: {
        ...(base || {}),
        ...enrich,
        enriched: true,
        enriched_at: new Date().toISOString()
      },
      doc_as_upsert: true
    });
  });
  const resp = await client.bulk({ body, refresh: false });
  if (resp.errors) {
    const items = resp.items || [];
    const failed = items.filter((i) => i.update && i.update.error);
    if (failed.length) {
      console.warn('Bulk update had failures:', failed.slice(0, 3));
      failed.slice(0, 3).forEach((f, idx) => {
        console.warn(`❌ Bulk fail #${idx + 1}:`, {
          id: f.update?._id,
          status: f.update?.status,
          error: f.update?.error
        });
      });
    }
  }
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const normalizeMealType = (val) => {
  if (!val) return null;
  const v = String(val).toLowerCase();
  if (['breakfast', 'brunch'].includes(v)) return 'breakfast';
  if (['lunch'].includes(v)) return 'lunch';
  if (['dinner', 'supper'].includes(v)) return 'dinner';
  if (['snack'].includes(v)) return 'snack';
  // Be conservative: do not coerce dessert/appetizer/beverage into snack; leave unknown as null
  return null;
};

const parseIngredientsForHit = (hit) => {
  const src = hit?._source || {};
  let candidates = [];
  if (Array.isArray(src.ingredients_norm) && src.ingredients_norm.length) {
    candidates = src.ingredients_norm;
  } else if (typeof src.ingredients_raw === 'string' && src.ingredients_raw.trim()) {
    candidates = src.ingredients_raw.split(/[,;\n]+/);
  }
  return candidates
    .map((raw, idx) => {
      const name = String(raw || '').trim();
      if (!name) return null;
      return {
        name,
        amount: '1',
        unit: 'unit',
        category: 'other',
        index: idx
      };
    })
    .filter(Boolean);
};

const embedText = async (text) => {
  if (!withEmbedding || !text) return null;
  const t0 = Date.now();
  try {
    const res = await fetch(`${embeddingHost}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModel, prompt: text })
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Embedding error ${res.status}: ${msg}`);
    }
    const data = await res.json();
    if (logTiming) console.log(`⏱️ Embedding (${embeddingHost}) took ${Date.now() - t0} ms, dims=${data?.embedding?.length || 0}`);
    return data?.embedding || null;
  } catch (err) {
    console.warn(`⚠️ Embedding failed: ${err.message}`);
    return null;
  }
};

const processGroup = async (group) => {
  const shouldLogSnippet = verbose;
  const tGroupStart = Date.now();
  const tPromptStart = Date.now();
  if (shouldLogSnippet) {
    const ids = group.map((h) => h._id).join(', ');
    console.log(`▶️ Groq/Ollama request for ids: ${ids}`);
  }
  const prompt = buildPromptForGroup(group);
  const respText = await callLLM(prompt);
  if (logTiming) console.log(`⏱️ Group prompt+LLM for ${group.length} docs took ${Date.now() - tPromptStart} ms`);
  if (shouldLogSnippet) {
    const snippet = respText ? respText.slice(0, 400) : '';
    console.log(`🟢 LLM response snippet (first 400 chars): ${snippet}`);
  }
  const parsed = parseResponse(respText);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected array from LLM response');
  }
  if (shouldLogSnippet) {
    console.log(`✅ Parsed ${parsed.length} items from LLM response`);
  }

  const hitMap = new Map(group.map((h) => [h._id, h]));
  const enriched = [];
  parsed.forEach((item) => {
    if (!item || !item.id) return;
    const srcHit = hitMap.get(item.id);
    const llmIngredients =
      Array.isArray(item.ingredients_parsed) && item.ingredients_parsed.length
        ? item.ingredients_parsed.map((ing) => `${ing.amount || '1'} ${ing.unit || 'unit'} ${ing.name || ''}`.trim()).join(', ')
        : null;
    const parsedIngredients = Array.isArray(item.ingredients_parsed) && item.ingredients_parsed.length
      ? item.ingredients_parsed
      : parseIngredientsForHit(srcHit);
    const embeddingText = srcHit
      ? [
          srcHit._source?.title,
          srcHit._source?.description,
          Array.isArray(srcHit._source?.ingredients_norm) ? srcHit._source.ingredients_norm.join(', ') : srcHit._source?.ingredients_raw,
          srcHit._source?.ingredients_raw,
          srcHit._source?.instructions,
          Array.isArray(item.diet_tags) ? item.diet_tags.join(', ') : '',
          Array.isArray(item.meal_type) ? item.meal_type.join(', ') : '',
          item.cuisine || '',
          item.course || '',
          item.activity_fit || '',
          item.goal_fit || '',
          item.difficulty || '',
          Array.isArray(item.allergens) ? item.allergens.join(', ') : '',
          llmIngredients,
          srcHit._source?.cuisine || '',
          srcHit._source?.course || '',
          srcHit._source?.activity_fit || '',
          srcHit._source?.goal_fit || '',
          srcHit._source?.difficulty || ''
        ]
          .filter(Boolean)
          .join('\n')
      : null;
    const mealTypes = Array.isArray(item.meal_type)
      ? item.meal_type.map(normalizeMealType).filter(Boolean)
      : [];
    const {
      cuisine = null,
      course = null,
      diet_tags = [],
      allergens = [],
      activity_fit = null,
      goal_fit = null,
      difficulty = null,
      servings = null,
      prep_time_min = null,
      cook_time_min = null,
      total_time_min = null,
      nutrition = {},
      high_protein = false,
      low_carb = false,
      kid_friendly = false,
      quick = false,
      one_pot = false
    } = item;
    const prepMinutes = prep_time_min ?? null;
    const cookMinutes = cook_time_min ?? null;
    const totalMinutes = total_time_min ?? null;
    enriched.push({
      id: item.id,
      base: srcHit?._source || {},
      embedText: embeddingText ? embeddingText.slice(0, 4000) : null, // trim to avoid context-length issues
      enrich: {
        cuisine,
        course,
        meal_type: mealTypes,
        diet_tags: Array.isArray(diet_tags) ? diet_tags : [],
        allergens: Array.isArray(allergens) ? allergens : [],
        ingredients_parsed: parsedIngredients,
        activity_fit: activity_fit || null,
        goal_fit: goal_fit || null,
        difficulty,
        servings: servings ?? null,
        prep_time_min: prepMinutes,
        cook_time_min: cookMinutes,
        total_time_min: totalMinutes,
        prep_time_minutes: prepMinutes,
        cook_time_minutes: cookMinutes,
        total_time_minutes: totalMinutes,
        nutrition: nutrition && typeof nutrition === 'object' ? nutrition : {},
        high_protein: !!high_protein,
        low_carb: !!low_carb,
        kid_friendly: !!kid_friendly,
        quick: !!quick,
        one_pot: !!one_pot
      }
    });
  });

  if (enriched.length) {
    if (withEmbedding) {
      for (const doc of enriched) {
        const vec = await embedText(doc.embedText);
        if (vec) doc.enrich.embedding = vec;
      }
    }
    if (logTiming) console.log(`⏱️ Bulk update ${enriched.length} docs...`);
    await updateBatch(enriched.map(({ id, enrich, base }) => ({ id, enrich, base })));
  }
  if (logTiming) console.log(`✅ Group processed in ${Date.now() - tGroupStart} ms (ids: ${enriched.map(e => e.id).join(', ')})`);
};

let globalGroupId = 0;
const processDocs = async (hits) => {
  const groups = chunkArray(hits, groupSize).map((g) => ({ id: ++globalGroupId, data: g }));
  const queue = [...groups];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async (_, workerId) => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const label = `worker-${workerId}-group-${item.id}`;
      if (verbose) console.log(`▶️ ${label} start (queue ${queue.length})`);
      const start = Date.now();
      try {
        await processGroup(item.data);
        if (verbose) console.log(`✅ ${label} done in ${Date.now() - start}ms`);
      } catch (err) {
        console.warn(`⚠️ ${label} failed and will be skipped: ${err.message}`);
      }
    }
  });
  await Promise.all(workers);
};

const main = async () => {
  console.log(
    provider === 'groq'
      ? `ℹ️ Starting enrichment with Groq model "${groqModel}"`
      : `ℹ️ Starting enrichment with Ollama model "${model}" across hosts: ${hostPool.join(', ')}`
  );
  if (provider === 'groq') {
    console.log(`ℹ️ Groq base: ${process.env.GROQ_BASE || 'https://api.groq.com/openai/v1'}`);
  }
  console.log(`ℹ️ Target index: ${targetIndex}`);
  console.log(`ℹ️ Batch size (scroll): ${batchSize}, group size (per prompt): ${groupSize}, concurrency: ${concurrency}${maxDocs ? `, limit: ${maxDocs}` : ''}`);
  if (verbose) console.log('ℹ️ Verbose logging enabled');

  let processed = 0;

  const baseQuery = skipEnriched
    ? { bool: { must_not: [{ exists: { field: 'enriched' } }] } }
    : { match_all: {} };

  const initial = await client.search({
    index: targetIndex,
    size: batchSize,
    scroll: scrollKeepAlive,
    sort: ['_doc'],
    query: baseQuery
  });

  let scrollId = initial._scroll_id;
  let hits = initial.hits?.hits || [];

  while (hits.length) {
    await processDocs(hits);
    processed += hits.length;
    if (maxDocs && processed >= maxDocs) {
      console.log(`⏹️ Reached limit of ${maxDocs} docs, stopping.`);
      break;
    }

  try {
    const next = await client.scroll({
      scroll_id: scrollId,
      scroll: scrollKeepAlive
    });
      scrollId = next._scroll_id;
      hits = next.hits?.hits || [];
      console.log(`➡️ Processed ${processed} docs...`);
    } catch (err) {
      console.error('❌ Scroll failed (possibly expired). Restart the script or reduce batch-size/concurrency.', err.message);
      break;
    }
  }

  console.log(`✅ Done. Processed ${processed} docs.`);
  process.exit(0);
};

main().catch((err) => {
  console.error('❌ Enrichment failed:', err);
  process.exit(1);
});
