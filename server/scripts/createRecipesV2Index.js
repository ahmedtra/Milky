#!/usr/bin/env node
/**
 * Create a recipes_v2 index with a schema aligned to the enrichment plan:
 * raw text, normalized fields, enriched metadata, nutrition, booleans, and a vector field.
 *
 * Usage:
 *   node server/scripts/createRecipesV2Index.js --index recipes_v2
 *
 * Env:
 *   ELASTICSEARCH_NODE (default http://localhost:9200)
 *   ELASTICSEARCH_API_KEY or ELASTICSEARCH_USERNAME/ELASTICSEARCH_PASSWORD if secured
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Client } = require('@elastic/elasticsearch');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
};

const indexName = getArg('index', 'recipes_v2');

const defaultNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const auth = process.env.ELASTICSEARCH_API_KEY
  ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
  : (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD)
    ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD }
    : undefined;

const client = new Client({ node: defaultNode, auth });

const mapping = {
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
    dynamic: true,
    properties: {
      recipe_id: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'recipe_text',
        fields: {
          raw: { type: 'keyword', ignore_above: 256 }
        }
      },
      ingredients_raw: { type: 'text', analyzer: 'recipe_text' },
      ingredients_normalized: { type: 'keyword' },
      directions: { type: 'text', analyzer: 'recipe_text' },
      link: { type: 'keyword' },
      source: { type: 'keyword' },
      cuisine: { type: 'keyword' },
      course: { type: 'keyword' }, // starter/main/dessert/side/drink/other
      meal_type: { type: 'keyword' }, // breakfast/lunch/dinner/snack
      diet_tags: { type: 'keyword' },
      allergens: { type: 'keyword' },
      difficulty: { type: 'keyword' },
      servings: { type: 'integer' },
      prep_time_min: { type: 'integer' },
      cook_time_min: { type: 'integer' },
      total_time_min: { type: 'integer' },
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
      embedding: {
        type: 'dense_vector',
        dims: 768,
        similarity: 'cosine'
      }
    }
  }
};

const main = async () => {
  try {
    const exists = await client.indices.exists({ index: indexName });
    if (exists) {
      console.log(`Index "${indexName}" already exists. Delete it first if you want a clean slate.`);
      process.exit(0);
    }

    await client.indices.create({
      index: indexName,
      ...mapping
    });
    console.log(`✅ Created index "${indexName}" with v2 mapping.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create index:', err);
    process.exit(1);
  }
};

main();
