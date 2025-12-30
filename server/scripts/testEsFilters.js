#!/usr/bin/env node
/**
 * Quick helper to test the Elasticsearch filtering used for candidates.
 * Usage:
 *   ELASTICSEARCH_RECIPE_INDEX=recipes_sample node server/scripts/testEsFilters.js
 */

require('dotenv').config();
const { searchRecipes } = require('../services/recipeSearch/searchService');

const run = async () => {
  const filters = {
    meal_type: process.env.TEST_MEAL_TYPE || 'lunch',
    diet_tags: (process.env.TEST_DIET_TAGS || 'balanced').split(',').map((v) => v.trim()).filter(Boolean),
    include_ingredients: (process.env.TEST_INCLUDE || '').split(',').map((v) => v.trim()).filter(Boolean),
    exclude_ingredients: (process.env.TEST_EXCLUDE || '').split(',').map((v) => v.trim()).filter(Boolean),
    cuisine: process.env.TEST_CUISINE || null,
  };

  console.log('🔍 Filters:', filters);

  const res = await searchRecipes(filters, { size: Number(process.env.TEST_SIZE || 20), randomSeed: Date.now() });
  console.log(`✅ Hits: ${res.total}, showing ${res.results.length}`);
  res.results.forEach((r, idx) => {
    console.log(
      `${idx + 1}. ${r.title} (id: ${r.id}, meal_type: ${r.meal_type}, diet_tags: ${r.diet_tags || r.dietary_tags}, cuisine: ${r.cuisine})`
    );
  });
};

run().catch((err) => {
  console.error('❌ Test failed:', err.message);
  if (err.meta) console.error(err.meta.body);
  process.exit(1);
});
