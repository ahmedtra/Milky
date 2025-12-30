#!/usr/bin/env node
/**
 * Copy a random sample of recipes from one index to another.
 *
 * Usage:
 *   node server/scripts/sampleRecipes.js --source recipes_v2 --target recipes_sample --size 1000
 *
 * Env:
 *   ELASTICSEARCH_NODE (default http://localhost:9200)
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

const sourceIndex = getArg('source', 'recipes');
const targetIndex = getArg('target', 'recipes_sample');
const sampleSize = Number(getArg('size', 1000));

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

const main = async () => {
  console.log(`📥 Sampling ${sampleSize} docs from "${sourceIndex}" into "${targetIndex}"`);

  // Create target with source mapping if missing
  const exists = await client.indices.exists({ index: targetIndex });
  if (!exists) {
    const srcMapping = await client.indices.get({ index: sourceIndex });
    const srcDef = srcMapping[sourceIndex] || srcMapping.body?.[sourceIndex];
    // Keep only safe settings (drop runtime metadata like creation_date/uuid)
    const srcSettings = srcDef?.settings?.index?.analysis
      ? { analysis: srcDef.settings.index.analysis }
      : undefined;
    await client.indices.create({
      index: targetIndex,
      body: { settings: srcSettings, mappings: srcDef.mappings }
    });
    console.log(`✅ Created target index "${targetIndex}"`);
  }

  // Fetch random sample
  // Try random_score on _seq_no to avoid _id fielddata; fallback to script_score if needed
  let res;
  try {
    res = await client.search({
      index: sourceIndex,
      size: sampleSize,
      track_total_hits: false,
      query: {
        function_score: {
          query: { match_all: {} },
          functions: [{ random_score: { seed: Date.now(), field: '_seq_no' } }]
        }
      },
      _source: true
    });
  } catch (err) {
    // Fallback: pure script_score random if random_score hits fielddata errors
    console.warn('⚠️ random_score failed, retrying with script_score random. Error:', err.message);
    res = await client.search({
      index: sourceIndex,
      size: sampleSize,
      track_total_hits: false,
      query: {
        function_score: {
          query: { match_all: {} },
          boost_mode: 'replace',
          script_score: { script: 'Math.random()' }
        }
      },
      _source: true
    });
  }

  const hits = res.hits?.hits || [];
  if (!hits.length) {
    console.log('⚠️ No hits found to copy.');
    return;
  }

  const body = [];
  for (const h of hits) {
    body.push({ index: { _index: targetIndex, _id: h._id } });
    body.push(h._source);
  }

  const bulkResp = await client.bulk({ refresh: true, body });
  if (bulkResp.errors) {
    console.warn('⚠️ Bulk had errors (see response items for details).');
  }
  console.log(`✅ Copied ${hits.length} docs to "${targetIndex}".`);
};

main().catch((e) => {
  console.error('❌ Sampling failed:', e.message);
  if (e.meta) console.error(e.meta.body);
  process.exit(1);
});
