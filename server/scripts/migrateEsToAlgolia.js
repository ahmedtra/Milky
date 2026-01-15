#!/usr/bin/env node
/**
 * Migrate all documents from the configured Elasticsearch recipe index into Algolia.
 *
 * Env (in .env):
 *  - ELASTICSEARCH_NODE / ELASTICSEARCH_API_KEY / ELASTICSEARCH_USERNAME / ELASTICSEARCH_PASSWORD
 *  - ELASTICSEARCH_RECIPE_INDEX (defaults to "recipes")
 *  - ALGOLIA_APP_ID
 *  - ALGOLIA_WRITE_API_KEY
 *  - ALGOLIA_INDEX_NAME (defaults to ELASTICSEARCH_RECIPE_INDEX or "recipes")
 *
 * Usage:
 *   node server/scripts/migrateEsToAlgolia.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const fetch = global.fetch || require("node-fetch");
const { client: esClient, recipeIndex: defaultRecipeIndex } = require("../services/recipeSearch/elasticsearchClient");

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_WRITE_API_KEY = process.env.ALGOLIA_WRITE_API_KEY;
const ALGOLIA_INDEX_NAME = process.env.ALGOLIA_INDEX_NAME || defaultRecipeIndex || "recipes";
const ALGOLIA_VECTOR_FIELD = process.env.ALGOLIA_VECTOR_FIELD || "embedding";
const ALGOLIA_VECTOR_SOURCE_FIELD = process.env.ALGOLIA_VECTOR_SOURCE_FIELD || ALGOLIA_VECTOR_FIELD;
const RECIPE_INDEX = process.env.ELASTICSEARCH_RECIPE_INDEX || defaultRecipeIndex || "recipes";

if (!ALGOLIA_APP_ID || !ALGOLIA_WRITE_API_KEY) {
  console.error("❌ Missing ALGOLIA_APP_ID or ALGOLIA_WRITE_API_KEY in .env");
  process.exit(1);
}

const ALGOLIA_BATCH_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(
  ALGOLIA_INDEX_NAME
)}/batch`;

const BATCH_SIZE = 500; // ES fetch size
const ALGOLIA_BATCH_CHUNK = 900; // keep well under the 1k limit per batch

async function sendToAlgolia(records) {
  if (!records.length) return;
  for (let i = 0; i < records.length; i += ALGOLIA_BATCH_CHUNK) {
    const slice = records.slice(i, i + ALGOLIA_BATCH_CHUNK);
    const body = {
      requests: slice.map((rec) => ({
        action: "updateObject",
        body: rec,
      })),
    };
    const resp = await fetch(ALGOLIA_BATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-API-Key": ALGOLIA_WRITE_API_KEY,
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Algolia batch failed (${resp.status}): ${text}`);
    }
  }
}

async function migrate() {
  console.log(`🚚 Migrating ES index "${RECIPE_INDEX}" => Algolia index "${ALGOLIA_INDEX_NAME}"`);

  let totalSent = 0;
  let scrollId = null;

  const firstPage = await esClient.search({
    index: RECIPE_INDEX,
    size: BATCH_SIZE,
    scroll: "2m",
    _source: true,
    query: { match_all: {} },
  });

  scrollId = firstPage._scroll_id || firstPage.body?._scroll_id;
  let hits = firstPage.hits?.hits || firstPage.body?.hits?.hits || [];

  while (hits.length) {
    const getNested = (obj, path) => {
      if (!obj || !path) return undefined;
      const parts = path.split(".");
      let cur = obj;
      for (const p of parts) {
        cur = cur?.[p];
        if (cur === undefined) return undefined;
      }
      return cur;
    };

    const toSend = hits.map((h) => {
      const rec = {
        objectID: h._id,
        ...h._source,
      };
      // Preserve vector embedding if present (supports nested paths like "enrich.embedding")
      const vec = getNested(h._source, ALGOLIA_VECTOR_SOURCE_FIELD);
      if (ALGOLIA_VECTOR_FIELD && Array.isArray(vec)) {
        rec[ALGOLIA_VECTOR_FIELD] = vec;
      }
      return rec;
    });
    await sendToAlgolia(toSend);
    totalSent += toSend.length;
    console.log(`✅ Sent ${toSend.length} docs (total ${totalSent})`);

    const next = await esClient.scroll({
      scroll: "2m",
      scroll_id: scrollId,
    });
    scrollId = next._scroll_id || next.body?._scroll_id;
    hits = next.hits?.hits || next.body?.hits?.hits || [];
  }

  console.log(`🎉 Migration complete. Total documents sent: ${totalSent}`);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  if (err.meta?.body) console.error(err.meta.body);
  process.exit(1);
});
