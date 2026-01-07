const fetch = global.fetch || require("node-fetch");

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY || process.env.LEONARDO_KEY;
const LEONARDO_API_BASE = "https://cloud.leonardo.ai/api/rest/v1";
// Default to Leonardo Vision XL; override via env if needed
const LEONARDO_MODEL_ID = process.env.LEONARDO_MODEL_ID || "5c232a9e-9061-4777-980a-ddc8e65647c6";
const { client: esClient, recipeIndex } = require("./recipeSearch/elasticsearchClient");

const hasKey = () => Boolean(LEONARDO_API_KEY);

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

function buildPrompt(recipe) {
  const name = recipe?.name || "meal";
  const ingList = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const instructionsList = Array.isArray(recipe?.instructions) ? recipe.instructions : [];

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

  return [
    "Premium food photography of the final plated dish (fully cooked, no raw prep or loose ingredients).",
    "Soft minimalism, clean plating, natural light, botanical green accent.",
    `Dish: ${name}.`,
    details.join(" "),
    "Show a ready-to-eat presentation on a plate or bowl. No raw meat or cutting boards."
  ].join(" ").trim();
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

async function generateMealImage(recipe) {
  if (!hasKey()) {
    throw new Error("Leonardo API key not configured");
  }
  const prompt = buildPrompt(recipe);
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
async function ensureMealImage(meal) {
  try {
    if (!meal?.recipes?.length) return meal;
    const recipe = meal.recipes[0];
    if (recipe.image || recipe.imageUrl) return meal;
    if (!hasKey()) return meal;
    const url = await generateMealImage(recipe);
    if (url) {
      recipe.image = url;
      recipe.imageUrl = url;
      // If this recipe is already in Elasticsearch, persist the image URL there too
      const esId = recipe.recipeId || recipe._id;
      if (esId) {
        try {
          await esClient.update({
            index: recipeIndex,
            id: esId,
            doc: { image: url, imageUrl: url },
            doc_as_upsert: false,
          });
        } catch (err) {
          // Ignore missing docs; we still keep the Mongo copy
          if (err?.meta?.statusCode !== 404) {
            console.warn("⚠️ Failed to persist image to Elasticsearch", err.message);
          }
        }
      }
    }
    return meal;
  } catch (err) {
    console.warn("⚠️ Leonardo image generation skipped:", err.message);
    if (process.env.NODE_ENV !== "production") {
      console.error(err);
    }
    return meal;
  }
}

module.exports = {
  ensureMealImage,
  generateMealImage,
};
