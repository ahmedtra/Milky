#!/usr/bin/env node
/**
 * One-off helper to upsert image/imageUrl into Zilliz for a single recipe.
 *
 * Usage:
 *   ZILLIZ_ENDPOINT=... ZILLIZ_TOKEN=... ZILLIZ_COLLECTION=recipes \
 *   RECIPE_ID="<primary-key>" IMAGE_URL="https://..." node server/scripts/upsertImageToZilliz.js
 */
require("dotenv").config();
const { milvus, ZILLIZ_COLLECTION } = require("../services/recipeSearch/zillizClient");

async function main() {
  const id = '-PhJPJsBrdU5vx_hnNZb';
  const url = 'https://drive.google.com/uc?export=view&id=1Y0jC0oWfMpAqhF1SFNQejWPX8xk93s8X';
  if (!id || !url) {
    console.error("❌ Set RECIPE_ID and IMAGE_URL env vars");
    process.exit(1);
  }

  await milvus.loadCollectionSync({ collection_name: ZILLIZ_COLLECTION });
  const payload = { id: String(id), image: url, imageUrl: url };
  const res = await milvus.upsert({
    collection_name: ZILLIZ_COLLECTION,
    data: [payload],
    partial_update: true,
  });
  console.log("Upsert result:", res?.status || res?.error_code || "ok", payload);
}

main().catch((err) => {
  console.error("❌ Upsert failed:", err);
  process.exit(1);
});
