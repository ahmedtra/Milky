const fetch = global.fetch || require("node-fetch");

const LEONARDO_API_KEY = (process.env.LEONARDO_API_KEY || process.env.LEONARDO_KEY || "").trim();
const SILICONFLOW_API_KEY = (process.env.SILICONFLOW_API_KEY || "").trim();
const SILICONFLOW_MODEL = process.env.SILICONFLOW_MODEL || "black-forest-labs/FLUX.1-schnell";
const LEONARDO_API_BASE = "https://cloud.leonardo.ai/api/rest/v1";
// Default to Leonardo Vision XL; override via env if needed
const LEONARDO_MODEL_ID = process.env.LEONARDO_MODEL_ID || "5c232a9e-9061-4777-980a-ddc8e65647c6";
const { groqChat } = require("./groqClient");
const crypto = require("crypto");
let milvus = null;
let ZILLIZ_COLLECTION = null;
try {
  ({ milvus, ZILLIZ_COLLECTION } = require("./recipeSearch/zillizClient"));
} catch (_e) {
  // Zilliz not configured; skip vector DB image updates
}
const R2_ENDPOINT = (process.env.R2_ENDPOINT || "").replace(/\/$/, "");
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
const R2_ACCESS_KEY = (process.env.R2_ACCESS_KEY || process.env.R2_ACCESS_KEY_ID || "").trim();
const R2_SECRET_KEY = (process.env.R2_SECRET_KEY || process.env.R2_SECRET_ACCESS_KEY || "").trim();
const R2_BUCKET = (process.env.R2_BUCKET || "milky").trim();
const hasR2 = () => R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET;

const normalizeToPublicR2 = (url) => {
  if (!url || !R2_PUBLIC_BASE) return url;
  const match = url.match(/https?:\/\/[^/]+\/milky\/(.+)/);
  if (match) return `${R2_PUBLIC_BASE}/${match[1]}`;
  return url;
};
const isPublicR2 = (url) => !!(url && R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE));

const hasKey = () => Boolean(LEONARDO_API_KEY);
const hasSiliconKey = () => Boolean(SILICONFLOW_API_KEY);

async function postJSON(path, body) {
  const res = await fetch(`${LEONARDO_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LEONARDO_API_KEY}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_e) {}
    console.error("❌ Leonardo POST error", {
      path,
      status: res.status,
      body,
      response: parsed || text,
    });
    throw new Error(`Leonardo POST ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function getJSON(path) {
  const res = await fetch(`${LEONARDO_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${LEONARDO_API_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Leonardo GET ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

function sanitizePromptText(text) {
  if (!text) return "";
  return String(text)
    .replace(/skimpy/gi, "simple")
    .replace(/\bcutting\b/gi, "slicing")
    .replace(/\bcut\b/gi, "slice");
}

function buildPrompt(recipe) {
  const name = recipe?.name || "meal";
  const ingList = Array.isArray(recipe?.ingredients) ? recipe.ingredients.slice(0, 6) : [];
  // Keep prompt tight to avoid moderation and length issues
  const instructionsList = Array.isArray(recipe?.instructions) ? recipe.instructions.slice(0, 2) : [];

  const ingredients = ingList
    .map((ing) => (typeof ing === "string" ? ing : ing?.name))
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
  const instructions = instructionsList
    .map((s) => (typeof s === "string" ? s : null))
    .filter(Boolean)
    .slice(0, 3)
    .join(". ");

  const details = [];
  if (ingredients) details.push(`Key ingredients: ${ingredients}.`);
  if (instructions) details.push(`Cooking steps: ${instructions}.`);

  const prompt = [
    "Ultra-realistic, appetizing food photo of the finished dish on a plate, inviting to eat.",
    "Plated like a modern bistro: clean white plate, gentle highlights, natural daylight, shallow depth of field.",
    "Warm tones, light steam if hot, fresh herbs or citrus for brightness, no text or watermarks.",
    `Dish: ${name}.`,
    details.join(" "),
    "Emphasize texture and juiciness; keep background uncluttered."
  ]
    .join(" ")
    .trim();

  return sanitizePromptText(prompt);
}

function truncatePrompt(prompt, maxLen = 1400) {
  if (typeof prompt !== "string") return "";
  if (prompt.length <= maxLen) return prompt;
  return prompt.slice(0, maxLen - 3).trimEnd() + "...";
}

// Minimal AWS SigV4 signer for R2
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
  // Public URL (assumes bucket/object is publicly accessible)
  const base = R2_PUBLIC_BASE || `${R2_ENDPOINT}/${R2_BUCKET}`;
  return `${base}/${key}`;
}

async function rehostUrlToR2(sourceUrl, keyHint) {
  if (!hasR2() || !sourceUrl) return sourceUrl;
  try {
    const resp = await fetch(sourceUrl);
    if (!resp.ok) throw new Error(`Download failed ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const key = `${(keyHint || "image").replace(/[^a-z0-9_-]+/gi, "_") || "image"}.png`;
    const r2Url = await uploadToR2FromBuffer(buf, key);
    return normalizeToPublicR2(r2Url);
  } catch (err) {
    console.warn("⚠️ R2 rehost failed:", err.message);
    return sourceUrl;
  }
}

async function summarizePromptWithGroq(recipe) {
  if (!groqChat || !process.env.GROQ_API_KEY) return null;
  const name = recipe?.name || "meal";
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients.slice(0, 8) : [];
  const instructions = Array.isArray(recipe?.instructions) ? recipe.instructions.slice(0, 6) : [];
  const userPayload = {
    name,
    ingredients,
    instructions,
  };
  const messages = [
    {
      role: "system",
      content:
        "You are crafting a concise prompt (<=1400 characters) for a food photo generator. Describe a ready-to-eat plated dish. Avoid raw/skimpy terms. Keep it simple, appetizing, and photogenic.",
    },
    {
      role: "user",
      content: `Build a single prompt for a plated food photo. Use this recipe data: ${JSON.stringify(userPayload)}. Keep it short and safe.`,
    },
  ];
  try {
    const { content } = await groqChat({
      messages,
      maxTokens: 400,
      temperature: 0.3,
    });
    return truncatePrompt(sanitizePromptText(content || ""));
  } catch (err) {
    console.warn("ℹ️ Groq prompt summarize failed, falling back to local prompt", err.message);
    return null;
  }
}

async function waitForGeneration(id, { timeoutMs = 300000, pollMs = 2000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await getJSON(`/generations/${id}`);
    const data = response?.generations_by_pk;
    const status = data?.status;
    const images = data?.generated_images;
    if (status === "COMPLETE" && Array.isArray(images) && images.length) {
      const url = images[0]?.url || images[0]?.generated_image_url;
      if (url) return url;
    }
    if (status === "FAILED" || status === "ERROR" || status === "CANCELED") {
      throw new Error(`Leonardo generation failed with status ${status}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Leonardo generation timed out");
}

async function upsertImageToZilliz(recipeId, driveUrl, generatorUrl) {
  if (!milvus || !ZILLIZ_COLLECTION || !recipeId || !driveUrl) return;
  try {
    await milvus.upsert({
      collection_name: ZILLIZ_COLLECTION,
      data: [{ id: String(recipeId), image: driveUrl, imageUrl: driveUrl }],
      partial_update: true,
    });
    console.log("✅ Persisted image to Zilliz", { id: recipeId, url: driveUrl });
  } catch (err) {
    console.warn("⚠️ Failed to persist image to Zilliz", err.message);
  }
}

async function generateMealImage(recipe) {
  if (!hasKey() && !hasSiliconKey()) {
    throw new Error("No image provider API key configured");
  }
  const groqPrompt = await summarizePromptWithGroq(recipe);
  const prompt = truncatePrompt(groqPrompt || buildPrompt(recipe));

      // Prefer SiliconFlow if configured
      if (hasSiliconKey()) {
        try {
          console.log("🖼️ Generating meal image via SiliconFlow...");
          const res = await fetch("https://api.siliconflow.com/v1/images/generations", {
            method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
        },
        body: JSON.stringify({
          model: SILICONFLOW_MODEL,
          prompt,
          image_size: "768x768",
          n: 1,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`SiliconFlow image gen failed ${res.status}: ${text}`);
      }
      const data = await res.json();
      const url = data?.data?.[0]?.url || data?.data?.[0]?.b64_json;
      if (url) {
        console.log("✅ SiliconFlow image generated");
        return url;
      }
    } catch (err) {
      console.warn("⚠️ SiliconFlow image generation failed, falling back to Leonardo:", err.message);
    }
  }

  if (!hasKey()) throw new Error("Leonardo API key not configured");
  console.log("🖼️ Generating meal image via Leonardo...");
  const body = {
    prompt,
    modelId: LEONARDO_MODEL_ID,
    num_images: 1,
    width: 768,
    height: 768,
    guidance_scale: 7,
    alchemy: true,
    presetStyle: "FOOD",
  };

  const gen = await postJSON("/generations", body);
  const genId = gen?.sdGenerationJob?.generationId || gen?.generationId;
  if (!genId) throw new Error("Leonardo generation id missing");
  return waitForGeneration(genId);
}

/**
 * Ensures the first recipe on a meal has an image.
 * Mutates the passed meal object if an image is added.
 */
async function ensureMealImage(meal, { throwOnFail = false } = {}) {
  try {
    if (!meal?.recipes?.length) return meal;
    const recipe = meal.recipes[0];
    // If recipe already has an image, ensure it is on the public R2 domain; if not, clear to force regeneration
    if (recipe.image || recipe.imageUrl) {
      const current = recipe.imageUrl || recipe.image;
      if (current && isPublicR2(current)) return meal;
      recipe.image = null;
      recipe.imageUrl = null;
    }
    if (!hasKey() && !hasSiliconKey()) return meal;
    const title = recipe.title || recipe.name;

    const safeNameBase = (recipe.title || recipe.name || "meal").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60);
    console.log("🖼️ Generating image for recipe:", {
      id: recipe.recipeId || recipe._id || recipe.id,
      title: recipe.title || recipe.name,
    });
    const url = await generateMealImage(recipe);
    if (url) {
      const remoteUrl = url; // generator URL
      // Upload to R2 for stable hosting
      let r2Url = normalizeToPublicR2(remoteUrl);
      if (hasR2()) {
        try {
          const resp = await fetch(remoteUrl);
          if (!resp.ok) throw new Error(`Download failed ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          const key = `${(recipe.recipeId || recipe._id || recipe.id || safeNameBase || "meal").toString().replace(/[^a-z0-9_-]+/gi, "_") || "meal"}.png`;
          r2Url = normalizeToPublicR2(await uploadToR2FromBuffer(buf, key));
        } catch (err) {
          console.warn("⚠️ Failed to upload to R2, falling back to generator URL:", err.message);
          r2Url = normalizeToPublicR2(remoteUrl);
        }
      }

      // Serve from R2
      recipe.image = r2Url;
      recipe.imageUrl = r2Url;
      console.log("🖼️ Image set on recipe", {
        id: recipe.recipeId || recipe._id || recipe.id,
        title,
        url: r2Url,
        remote: remoteUrl,
        r2: r2Url
      });
      const primaryIdRaw = recipe.recipeId || recipe._id || recipe.id;
      const zillizId = primaryIdRaw ? String(primaryIdRaw) : null;
      // Persist image to Zilliz as partial update
      await upsertImageToZilliz(zillizId, r2Url, r2Url);
    }
    return meal;
  } catch (err) {
    console.warn("⚠️ Leonardo image generation skipped:", err.message);
    if (process.env.NODE_ENV !== "production") {
      console.error(err);
    }
    if (throwOnFail) throw err;
    return meal;
  }
}

module.exports = {
  ensureMealImage,
  generateMealImage,
};
