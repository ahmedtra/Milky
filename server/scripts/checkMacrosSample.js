#!/usr/bin/env node
/**
 * Sample recipes from Elasticsearch and ask a stronger LLM to sanity-check macros.
 * Pulls N random recipes (default 10) from the specified index and returns a verdict for each.
 *
 * Usage:
 *   node server/scripts/checkMacrosSample.js --index recipes_index --size 10 --model llama-3.1-70b-versatile
 *
 * Requires GROQ_API_KEY in env.
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

const index = getArg('index', process.env.ELASTICSEARCH_RECIPE_INDEX || 'recipes_index');
const size = Number(getArg('size', 10));
const model = getArg('model', process.env.GROQ_MODEL || 'llama-3.1-70b-versatile');

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is required');
  process.exit(1);
}

const fetchSamples = async () => {
  const randomSeed = Math.floor(Math.random() * 1_000_000);
  const res = await client.search({
    index,
    size,
    query: {
      function_score: {
        query: { match_all: {} },
        random_score: { seed: randomSeed }
      }
    },
    _source: {
      includes: ['title', 'ingredients_raw', 'ingredients_parsed', 'instructions', 'nutrition']
    }
  });
  return res.hits.hits || [];
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
You are checking if recipe macros are sensible. For each input item, return an array of:
{id, sensible:boolean, reason:string, calories:number, protein:number, carbs:number, fat:number, fiber:number, sugar:number}
- sensible = false if macros look zero/very wrong for the dish.
- Keep numbers reasonable; if unsure, adjust to a plausible estimate.
Return ONLY JSON array (no markdown).
INPUT:
${JSON.stringify(payload)}
`.trim();
};

(async () => {
  try {
    const docs = await fetchSamples();
    if (!docs.length) {
      console.log('No documents found.');
      return;
    }
    const prompt = buildPrompt(docs);
    const { content } = await groqChat({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a nutrition QA assistant. Return pure JSON only.' },
        { role: 'user', content: prompt }
      ]
    });
    let data = [];
    try {
      const cleaned = content.replace(/```json|```/gi, '');
      data = JSON.parse(cleaned);
    } catch (err) {
      console.error('Failed to parse LLM response:', err.message);
      console.error(content);
      process.exit(1);
    }
    data.forEach((row) => {
      console.log(
        `${row.id}: sensible=${row.sensible} | cal=${row.calories} protein=${row.protein} carbs=${row.carbs} fat=${row.fat} fiber=${row.fiber} sugar=${row.sugar} | reason=${row.reason}`
      );
    });
  } catch (err) {
    console.error('Error running macro check:', err);
    process.exit(1);
  }
})();
