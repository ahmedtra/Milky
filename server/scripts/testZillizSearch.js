#!/usr/bin/env node
/**
 * Quick sanity test for Zilliz search using the live search service.
 *
 * Usage:
 *   node server/scripts/testZillizSearch.js
 *   TEXT="chicken" node server/scripts/testZillizSearch.js
 *
 * Optional env vars:
 *   TEXT="query string"
 *   MEAL_TYPE="dinner"
 *   CUISINE="italian"
 *   DIET_TAGS="keto,high_protein"
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { searchRecipes } = require("../services/recipeSearch/searchService");

const main = async () => {
  const filters = {};
  if (process.env.TEXT) filters.text = process.env.TEXT;
  if (process.env.MEAL_TYPE) filters.meal_type = process.env.MEAL_TYPE;
  if (process.env.CUISINE) filters.cuisine = process.env.CUISINE;
  if (process.env.DIET_TAGS) filters.diet_tags = process.env.DIET_TAGS.split(",").map((s) => s.trim());
  if (process.env.INCLUDE_INGREDIENTS) {
    filters.include_ingredients = process.env.INCLUDE_INGREDIENTS.split(",").map((s) => s.trim());
  }
  if (process.env.EXCLUDE_INGREDIENTS) {
    filters.exclude_ingredients = process.env.EXCLUDE_INGREDIENTS.split(",").map((s) => s.trim());
  }

  const size = Number(process.env.SIZE || 5);
  console.log("🔎 Testing Zilliz search with filters:", filters, "size:", size);
  const { results } = await searchRecipes(filters, { size, logSearch: true });

  console.log(`✅ Returned ${results.length} hits`);
  results.forEach((r, i) => {
    console.log(
      `#${i + 1}: ${r.title || "(no title)"} | cuisine=${r.cuisine || "-"} | meal_type=${r.meal_type || "-"}`
    );
    if (r.embedding) {
      console.log(`   embedding dim=${Array.isArray(r.embedding) ? r.embedding.length : "none"}`);
    }
    
  });
};

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
