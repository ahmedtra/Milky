const { client, recipeIndex } = require('./elasticsearchClient');

const recipeIndexDefinition = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        recipe_text: {
          type: 'standard',
          stopwords: '_english_'
        }
      }
    }
  },
  mappings: {
    dynamic: false,
    properties: {
      title: { type: 'text', analyzer: 'recipe_text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
      description: { type: 'text', analyzer: 'recipe_text' },
      cuisine: { type: 'keyword' },
      course: { type: 'keyword' },
      meal_type: { type: 'keyword' },
      dietary_tags: { type: 'keyword' },
      // Canonical diet field used by enrichment/search; keep alongside legacy dietary_tags
      diet_tags: { type: 'keyword' },
      ingredients_norm: { type: 'keyword' },
      // Parsed ingredients stored as structured values so we do not have to sanitize at runtime
      ingredients_parsed: {
        type: 'nested',
        properties: {
          name: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
          amount: { type: 'keyword' },
          unit: { type: 'keyword' },
          category: { type: 'keyword' }
        }
      },
      ingredients_raw: { type: 'text', analyzer: 'recipe_text' },
      allergens: { type: 'keyword' },
      calories: { type: 'float' },
      calories_bucket: { type: 'keyword' },
      protein_grams: { type: 'float' },
      protein_bucket: { type: 'keyword' },
      prep_time_minutes: { type: 'integer' },
      cook_time_minutes: { type: 'integer' },
      total_time_minutes: { type: 'integer' },
      // Normalized minute fields (used by enrichment prompt)
      prep_time_min: { type: 'integer' },
      cook_time_min: { type: 'integer' },
      total_time_min: { type: 'integer' },
      difficulty: { type: 'keyword' },
      nutrition: {
        properties: {
          calories: { type: 'float' },
          protein_g: { type: 'float' },
          carbs_g: { type: 'float' },
          fat_g: { type: 'float' },
          fiber_g: { type: 'float' },
          sugar_g: { type: 'float' }
        }
      },
      high_protein: { type: 'boolean' },
      low_carb: { type: 'boolean' },
      kid_friendly: { type: 'boolean' },
      quick: { type: 'boolean' },
      one_pot: { type: 'boolean' },
      activity_fit: { type: 'keyword' },
      goal_fit: { type: 'keyword' },
      enriched: { type: 'boolean' },
      enriched_at: { type: 'date' },
      embedding: { type: 'dense_vector', dims: 768, similarity: 'cosine' },
      // Additional quality, cost, and user-facing signals
      rating: { type: 'float' },
      review_count: { type: 'integer' },
      popularity_score: { type: 'float' },
      reliability_score: { type: 'float' },
      cost_band: { type: 'keyword' }, // cheap / moderate / premium
      image_url: { type: 'keyword' },
      thumb_url: { type: 'keyword' },
      // Timing nuance
      active_time_min: { type: 'integer' },
      hands_off_time_min: { type: 'integer' },
      chill_time_min: { type: 'integer' },
      rest_time_min: { type: 'integer' },
      // Equipment / techniques
      requires_equipment: { type: 'keyword' }, // oven, grill, air_fryer, blender...
      requires_tools: { type: 'keyword' }, // sheet_pan, dutch_oven, wok...
      techniques: { type: 'keyword' }, // grilling, braising, roasting...
      // Occasion / season / flavor
      occasion: { type: 'keyword' }, // weeknight, mealprep, entertaining, holidays...
      season: { type: 'keyword' },   // spring/summer/fall/winter
      flavor_profile: { type: 'keyword' }, // spicy, sweet, savory...
      heat_level: { type: 'integer' }, // 0-3
      texture: { type: 'keyword' }, // crispy, creamy, chewy, brothy
      // Health / diet flags
      heart_healthy: { type: 'boolean' },
      diabetes_friendly: { type: 'boolean' },
      low_sodium: { type: 'boolean' },
      high_fiber: { type: 'boolean' },
      // Portioning
      yield_units: { type: 'keyword' }, // cookies, bars, servings label
      scalable: { type: 'boolean' },
      // Primary components
      primary_protein: { type: 'keyword' },
      primary_carb: { type: 'keyword' },
      primary_veg: { type: 'keyword' },
      avoid_keywords: { type: 'keyword' },
      instructions: { type: 'text', analyzer: 'recipe_text' },
      tags: { type: 'keyword' },
      source: { type: 'keyword' },
      url: { type: 'keyword' },
      ner: { type: 'keyword' },
      created_at: { type: 'date' }
    }
  }
};

const ensureRecipeIndex = async (indexName = recipeIndex) => {
  const existsResult = await client.indices.exists({ index: indexName });
  const exists = typeof existsResult === 'boolean' ? existsResult : existsResult.body;
  if (exists) return;

  console.log(`ℹ️ Creating recipe index "${indexName}" with mappings`);
  await client.indices.create({
    index: indexName,
    ...recipeIndexDefinition
  });
};

module.exports = {
  ensureRecipeIndex,
  recipeIndexDefinition
};
