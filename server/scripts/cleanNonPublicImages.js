#!/usr/bin/env node
/**
 * Clears image/imageUrl in Elasticsearch (and Zilliz if configured) when the URL
 * is NOT one of:
 *   - public R2 domain (R2_PUBLIC_BASE)
 *   - Leonardo CDN (*.leonardo.ai)
 *
 * This forces regeneration on next use.
 *
 * Usage:
 *   R2_PUBLIC_BASE=https://pub-...r2.dev \
 *   node server/scripts/cleanNonPublicImages.js
 */
require("dotenv").config();
const fetch = global.fetch || require("node-fetch");
const { client: esClient, recipeIndex } = require("../services/recipeSearch/elasticsearchClient");

let milvus = null;
let ZILLIZ_COLLECTION = null;
try {
  ({ milvus, ZILLIZ_COLLECTION } = require("../services/recipeSearch/zillizClient"));
} catch (_e) {
  // Zilliz optional
}

const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");

const isAllowed = (url) => {
  if (!url) return false;
  if (R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE)) return true;
  if (/^https?:\/\/([^/]+\.)?leonardo\.ai/i.test(url)) return true;
  return false;
};

async function processBatch(from = 0, size = 500) {
  const res = await esClient.search({
    index: recipeIndex,
    from,
    size,
    query: {
      bool: {
        should: [
          { exists: { field: "image" } },
          { exists: { field: "imageUrl" } },
        ],
      },
    },
    _source: ["image", "imageUrl"],
  });
  const hits = res?.hits?.hits || [];
  let updated = 0;

  for (const hit of hits) {
    const esId = hit._id;
    const src = hit._source || {};
    const url = src.imageUrl || src.image;
    if (!url) continue;
    if (isAllowed(url)) continue;

    // Clear image fields to force regeneration
    try {
      await esClient.update({
        index: recipeIndex,
        id: esId,
        doc: { image: null, imageUrl: null },
        doc_as_upsert: false,
      });
      if (milvus && ZILLIZ_COLLECTION) {
        await milvus.upsert({
          collection_name: ZILLIZ_COLLECTION,
          data: [{ id: String(esId), image: null, imageUrl: null }],
          partial_update: true,
        });
      }
      updated += 1;
      console.log("✅ cleared", esId, url);
    } catch (err) {
      console.warn("⚠️ failed to clear", esId, err.message);
    }
  }

  return { hits: hits.length, updated };
}

async function main() {
  let from = 0;
  const size = 500;
  let totalUpdated = 0;
  while (true) {
    const { hits, updated } = await processBatch(from, size);
    totalUpdated += updated;
    console.log(`Batch from=${from} size=${size} hits=${hits} updated=${updated}`);
    if (hits < size) break;
    from += size;
  }
  console.log("Done. Total cleared:", totalUpdated);
}

main().catch((err) => {
  console.error("❌ Clean failed:", err);
  process.exit(1);
});
