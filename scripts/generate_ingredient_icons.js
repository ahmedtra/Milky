#!/usr/bin/env node
/**
 * Script: generate_ingredient_icons.js
 * Purpose: Generate tiny, emoji-like ingredient icons via Leonardo.ai with low-cost params (alchemy off).
 *
 * Usage:
 *   LEONARDO_API_KEY=your_key node scripts/generate_ingredient_icons.js
 *
 * Notes:
 * - Uses minimal size (64x64) and 1 image per call to reduce cost.
 * - Alchemy explicitly disabled.
 * - Does NOT run automatically; wire in your Leonardo modelId if needed.
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.LEONARDO_API_KEY;
if (!API_KEY) {
  console.error("Missing LEONARDO_API_KEY in env");
  process.exit(1);
}

// Tiny emoji-like ingredients. Adjust list as needed.
const ingredients = [
  "Apple",
  "Banana",
  "Orange",
  "Strawberry",
  "Blueberry",
  "Tomato",
  "Cucumber",
  "Bell Pepper",
  "Onion",
  "Garlic",
  "Potato",
  "Sweet Potato",
  "Carrot",
  "Broccoli",
  "Cauliflower",
  "Spinach",
  "Kale",
  "Lettuce",
  "Avocado",
  "Cilantro",
  "Basil",
  "Ginger",
  "Celery",
  "Cabbage",
  "Chicken Breast",
  "Salmon",
  "Shrimp",
  "Tofu",
  "Eggs",
  "Greek Yogurt",
  "Cheddar",
  "Feta",
  "Black Beans",
  "Chickpeas",
  "Lentils",
  "Rice",
  "Quinoa",
  "Olive Oil",
  "Flour",
  "Sugar",
  "Honey",
  "Pasta",
];

// Configure generation
const generationDefaults = {
  width: 896,
  height: 896,
  num_images: 1,
  alchemy: true, // enable alchemy
  // If your account requires a specific model, set it here:
  modelId: process.env.LEONARDO_MODEL_ID || undefined,
  promptMagic: true,
  promptMagicStrength: 0.6,
  presetStyle: "CREATIVE",
  // contrast intentionally omitted to avoid API validation errors
  guidance_scale: 6, // moderate to reduce failures
};

const outputDir = path.join(__dirname, "..", "assets", "ingredient-icons");
fs.mkdirSync(outputDir, { recursive: true });

const basePrompt =
  "tiny 2D emoticon-style ingredient icon, cute botanical cartoon, clean white background, flat colors, no text, no watermark, simple silhouette, friendly and fun, {{INGREDIENT}}";
const negativePrompt =
  "photo, photorealistic, text, watermark, label, poster, busy background, multiple items, clutter";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollGeneration(generationId, name) {
  // Poll Leonardo until the generation is ready
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(2000);
    const pollRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
    });
    if (!pollRes.ok) {
      throw new Error(`Poll failed for ${name}: ${pollRes.status} ${pollRes.statusText}`);
    }
    const pollData = await pollRes.json();
    console.log(`[Poll ${attempt + 1}] ${name} pollData:`, pollData);
    const status =
      pollData?.generation?.status ||
      pollData?.generation_by_pk?.status ||
      pollData?.generations_by_pk?.status ||
      pollData?.status ||
      pollData?.generations?.[0]?.status;
    console.log(`[Poll ${attempt + 1}] ${name} status:`, status, "generationId:", generationId);
    if (status === "COMPLETE" || status === "completed") {
      const img =
        pollData?.generation?.generated_images?.[0]?.url ||
        pollData?.generation?.images?.[0]?.url ||
        pollData?.generated_images?.[0]?.url ||
        pollData?.generations?.[0]?.generated_images?.[0]?.url ||
        pollData?.generations?.[0]?.images?.[0]?.url ||
        pollData?.generations_by_pk?.generated_images?.[0]?.url;
      if (!img) throw new Error(`No image URL after completion for ${name}. Response: ${JSON.stringify(pollData).slice(0,300)}...`);
      console.log(`Polled URL for ${name}: ${img}`);
      return img;
    }
  }
  throw new Error(`Timeout waiting for image for ${name}`);
}

async function generateIcon(name) {
  const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  const targetPath = path.join(outputDir, fileName);
  if (fs.existsSync(targetPath)) {
    console.log(`Skipping ${name}, already exists at ${targetPath}`);
    return;
  }

  const prompt = basePrompt.replace("{{INGREDIENT}}", name);
  const body = {
    prompt,
    negative_prompt: negativePrompt,
    ...generationDefaults,
  };

  const res = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Leonardo request failed for ${name}: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = await res.json();
  const generationId = data?.generationId || data?.sdGenerationJob?.generationId || data?.generations?.[0]?.id;
  console.log(`Generation response for ${name}:`, {
    generationId,
    inlineUrl: data?.generations?.[0]?.generated_images?.[0]?.url || data?.generations?.[0]?.images?.[0]?.url,
  });
  if (!generationId) {
    throw new Error(`No generationId returned for ${name}`);
  }

  const imageUrl =
    data?.generations?.[0]?.generated_images?.[0]?.url ||
    data?.generations?.[0]?.images?.[0]?.url ||
    (await pollGeneration(generationId, name));

  console.log(`Download URL for ${name}: ${imageUrl}`);

  // Download with a couple retries
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`status ${imgRes.status}`);
      const buffer = await imgRes.arrayBuffer();
      fs.writeFileSync(targetPath, Buffer.from(buffer));
      console.log(`Saved ${fileName}`);
      return;
    } catch (err) {
      lastErr = err;
      await sleep(1000);
    }
  }
  throw new Error(`Failed to download image for ${name}: ${lastErr}`);
}

async function main() {
  for (const name of ingredients) {
    try {
      await generateIcon(name);
    } catch (err) {
      console.error(err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
