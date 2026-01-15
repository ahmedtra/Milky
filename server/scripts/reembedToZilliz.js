#!/usr/bin/env node
/**
 * Recompute embeddings for all recipes and upsert them into the Zilliz collection.
 *
 * Requirements:
 *   - ENV: NOMIC_API_KEY (or other embedding provider used by embeddingProvider)
 *   - Zilliz configured in .env (ZILLIZ_ENDPOINT, ZILLIZ_TOKEN, ZILLIZ_COLLECTION, ZILLIZ_VECTOR_FIELD, ZILLIZ_VECTOR_DIM)
 *   - Elasticsearch source (ELASTICSEARCH_NODE, ELASTICSEARCH_RECIPE_INDEX)
 *
 * Usage:
 *   node server/scripts/reembedToZilliz.js
 *
 * Notes:
 *   - Processes documents in batches with limited concurrency for embedding calls.
 *   - Upserts only id + embedding to Zilliz; other fields remain unchanged there.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { client, recipeIndex } = require("../services/recipeSearch/elasticsearchClient");
const { milvus, VECTOR_FIELD, ZILLIZ_COLLECTION, VECTOR_DIM } = require("../services/recipeSearch/zillizClient");
const { getQueryEmbedding } = require("../services/recipeSearch/embeddingProvider");

const BATCH_SIZE = Number(process.env.REEMBED_BATCH_SIZE || 100);
const CONCURRENCY = Number(process.env.REEMBED_CONCURRENCY || 4);

const buildText = (src = {}) => {
  const parts = [];
  if (src.title) parts.push(src.title);
  if (src.description) parts.push(src.description);
  if (src.ingredients_raw) parts.push(src.ingredients_raw);
  if (Array.isArray(src.ingredients_parsed)) {
    parts.push(src.ingredients_parsed.map((i) => i?.name || "").join(", "));
  }
  if (Array.isArray(src.instructions)) {
    parts.push(src.instructions.join(". "));
  } else if (src.directions) {
    parts.push(src.directions);
  }
  return parts.filter(Boolean).join(" \n ");
};

async function embedDoc(doc) {
  const text = buildText(doc);
  if (!text) return null;
  const vec = await getQueryEmbedding(text);
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
  return vec;
}

async function processBatch(hits) {
  const tasks = hits.map((h) => ({
    id: h._id,
    source: h._source || {},
  }));

  const results = [];
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }).map(async () => {
    while (idx < tasks.length) {
      const current = tasks[idx++];
      try {
        const vec = await embedDoc(current.source);
        if (vec) {
          results.push({ id: String(current.id), [VECTOR_FIELD]: vec });
        }
      } catch (err) {
        console.warn(`⚠️ Embed failed for ${current.id}:`, err.message);
      }
    }
  });
  await Promise.all(workers);
  if (results.length) {
    await milvus.insert({
      collection_name: ZILLIZ_COLLECTION,
      fields_data: results,
    });
  }
  return results.length;
}

async function main() {
  console.log(`🚀 Re-embedding from ES index "${recipeIndex}" to Zilliz collection "${ZILLIZ_COLLECTION}"`);
  let totalInserted = 0;

  const first = await client.search({
    index: recipeIndex,
    size: BATCH_SIZE,
    scroll: "2m",
    _source: true,
    query: { match_all: {} },
  });

  let scrollId = first._scroll_id || first.body?._scroll_id;
  let hits = first.hits?.hits || first.body?.hits?.hits || [];
  console.log(`🔍 First page: ${hits.length} hits`);

  while (hits.length) {
    const inserted = await processBatch(hits);
    totalInserted += inserted;
    console.log(`✅ Inserted ${inserted} vectors (total ${totalInserted})`);

    const next = await client.scroll({
      scroll: "2m",
      scroll_id: scrollId,
    });
    scrollId = next._scroll_id || next.body?._scroll_id;
    hits = next.hits?.hits || next.body?.hits?.hits || [];
  }

  console.log(`📦 Finalizing: loading collection "${ZILLIZ_COLLECTION}"`);
  await milvus.loadCollectionSync({ collection_name: ZILLIZ_COLLECTION });
  console.log(`🎉 Done. Total vectors updated: ${totalInserted}`);
}

main().catch((err) => {
  console.error("❌ Re-embedding failed:", err);
  process.exit(1);
});
