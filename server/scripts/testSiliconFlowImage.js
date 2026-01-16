#!/usr/bin/env node
require("dotenv").config();
const fetch = global.fetch || require("node-fetch");
const crypto = require("crypto");

// R2 config
const R2_ENDPOINT = (process.env.R2_ENDPOINT || "").replace(/\/$/, "");
const R2_ACCESS_KEY = (process.env.R2_ACCESS_KEY || process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_KEY = (process.env.R2_SECRET_KEY || process.env.R2_SECRET_ACCESS_KEY || "").trim();
const R2_BUCKET = (process.env.R2_BUCKET || "milky").trim();
const hasR2 = () => R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET;

function hmac(key, str) {
  return crypto.createHmac("sha256", key).update(str).digest();
}
function hash(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
function getAmzDate(date) {
  // returns YYYYMMDDTHHmmssZ
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
async function uploadToR2FromBuffer(buffer, key, contentType = "image/png") {
  if (!hasR2()) throw new Error("R2 not configured");
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
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");
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
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
}

async function main() {
  const apiKey = (process.env.SILICONFLOW_API_KEY || "").trim();
  const model = process.env.SILICONFLOW_MODEL || "black-forest-labs/FLUX.1-schnell";
  const prompt = process.argv.slice(2).join(" ") || "Appetizing plated pasta with tomato basil sauce, food photo";

  if (!apiKey) {
    console.error("❌ SILICONFLOW_API_KEY missing");
    process.exit(1);
  }

  console.log(`🔎 Testing SiliconFlow image gen with model=${model}`);
  try {
    const res = await fetch("https://api.siliconflow.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        image_size: "512x512",
        n: 1,
      }),
    });

    console.log("Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Body:", text.slice(0, 2000));

    try {
      const data = JSON.parse(text);
      const url = data?.data?.[0]?.url || data?.images?.[0]?.url;
      if (url) {
        console.log("Image URL:", url);
        if (hasR2()) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Download failed ${resp.status}`);
            const buf = Buffer.from(await resp.arrayBuffer());
            const key = `test-${Date.now()}.png`;
            const r2Url = await uploadToR2FromBuffer(buf, key);
            console.log("✅ R2 URL:", r2Url);
          } catch (err) {
            console.warn("⚠️ R2 upload failed:", err.message);
          }
        } else {
          console.log("ℹ️ R2 not configured; skipping upload.");
        }
      }
    } catch (_e) {
      // ignore parse errors
    }
  } catch (err) {
    console.error("❌ Request failed:", err);
    process.exit(1);
  }
}

main();
