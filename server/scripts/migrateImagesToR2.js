#!/usr/bin/env node
/**
 * One-off migration: rehost recipe images from legacy URLs to Cloudflare R2 public domain
 * and update Elasticsearch + Zilliz with the new URLs.
 *
 * Usage:
 *   R2_ENDPOINT=... R2_ACCESS_KEY=... R2_SECRET_KEY=... R2_BUCKET=milky R2_PUBLIC_BASE=https://...r2.dev \
 *   node server/scripts/migrateImagesToR2.js
 */
require("dotenv").config();
const fetch = global.fetch || require("node-fetch");
const crypto = require("crypto");
const { client: esClient, recipeIndex } = require("../services/recipeSearch/elasticsearchClient");

let milvus = null;
let ZILLIZ_COLLECTION = null;
try {
  ({ milvus, ZILLIZ_COLLECTION } = require("../services/recipeSearch/zillizClient"));
} catch (_e) {
  // Zilliz optional
}

const R2_ENDPOINT = (process.env.R2_ENDPOINT || "").replace(/\/$/, "");
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
const R2_ACCESS_KEY = (process.env.R2_ACCESS_KEY || process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_KEY = (process.env.R2_SECRET_KEY || process.env.R2_SECRET_ACCESS_KEY || "").trim();
const R2_BUCKET = (process.env.R2_BUCKET || "milky").trim();
const hasR2 = () => R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET;

if (!hasR2()) {
  console.error("❌ R2 env vars missing. Set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_PUBLIC_BASE");
  process.exit(1);
}

function hmac(key, str) {
  return crypto.createHmac("sha256", key).update(str).digest();
}
function hash(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
function getAmzDate(date) {
  // YYYYMMDDTHHmmssZ
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
async function uploadToR2FromBuffer(buffer, key, contentType = "image/png") {
  const method = "PUT";
  const now = new Date();
  const amzDate = getAmzDate(now);
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
  const region = "auto";
  const service = "s3";
  const host = new URL(R2_ENDPOINT).host;
  const canonicalUri = `/${R2_BUCKET}/${key}`;
  const payloadHash = hash(buffer);
  const canonicalHeaders = `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hash(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${R2_SECRET_KEY}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const res = await fetch(`${R2_ENDPOINT}${canonicalUri}`, {
    method,
    headers: {
      Host: host,
      "Content-Type": contentType,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: authorization,
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed ${res.status}: ${text}`);
  }
  const base = R2_PUBLIC_BASE || `${R2_ENDPOINT}/${R2_BUCKET}`;
  return `${base}/${key}`;
}

function normalizeToPublicR2(url) {
  if (!url || !R2_PUBLIC_BASE) return url;
  const match = url.match(/https?:\/\/[^/]+\/milky\/(.+)/);
  if (match) return `${R2_PUBLIC_BASE}/${match[1]}`;
  return url;
}

async function migrateBatch(from = 0, size = 200) {
  const res = await esClient.search({
    index: recipeIndex,
    from,
    size,
    query: {
      bool: {
        should: [
          { wildcard: { imageUrl: "*cloudflarestorage.com*" } },
          { wildcard: { image: "*cloudflarestorage.com*" } },
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
    let newUrl = normalizeToPublicR2(url);
    // If already on public domain, just update Zilliz/ES and continue
    if (!newUrl || newUrl === url) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Download failed ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        const key = `${String(esId).replace(/[^a-z0-9_-]+/gi, "_")}.png`;
        newUrl = await uploadToR2FromBuffer(buf, key);
      } catch (err) {
        console.warn("⚠️ R2 reupload failed; skipping", { esId, err: err.message });
        continue;
      }
    }
    try {
      await esClient.update({
        index: recipeIndex,
        id: esId,
        doc: { image: newUrl, imageUrl: newUrl },
        doc_as_upsert: false,
      });
      if (milvus && ZILLIZ_COLLECTION) {
        await milvus.upsert({
          collection_name: ZILLIZ_COLLECTION,
          data: [{ id: String(esId), image: newUrl, imageUrl: newUrl }],
          partial_update: true,
        });
      }
      updated += 1;
      console.log("✅ migrated", esId, "->", newUrl);
    } catch (err) {
      console.warn("⚠️ migrate failed", { esId, err: err.message });
    }
  }
  return { hits: hits.length, updated };
}

async function main() {
  let from = 0;
  const size = 200;
  let totalUpdated = 0;
  while (true) {
    const { hits, updated } = await migrateBatch(from, size);
    totalUpdated += updated;
    console.log(`Batch from=${from} size=${size} hits=${hits} updated=${updated}`);
    if (hits < size) break;
    from += size;
  }
  console.log("Done. Total updated:", totalUpdated);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
