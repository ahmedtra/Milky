#!/usr/bin/env node
/**
 * Quick Leonardo.ai image generation debug script.
 * Usage:
 *   LEONARDO_API_KEY=your_key LEONARDO_MODEL_ID=optional_model node scripts/test-leonardo.js
 * Optional ES patch:
 *   ELASTIC_URL=https://... ELASTIC_API_KEY=... ELASTIC_INDEX=... ELASTIC_ID=... node scripts/test-leonardo.js
 */

const fetch = global.fetch || require("node-fetch");
const { generateMealImage } = require("../server/services/leonardoService");

async function main() {
  if (!process.env.LEONARDO_API_KEY) {
    console.error("Missing LEONARDO_API_KEY env var.");
    process.exit(1);
  }

  const { ELASTIC_URL, ELASTIC_API_KEY, ELASTIC_INDEX, ELASTIC_ID } = process.env;

  const buildRecipeFromDoc = (doc) => {
    if (!doc) return null;
    const primary = doc.recipes?.[0] || {};
    const name = doc.name || doc.title || primary.name || "Meal";
    const ingredients =
      doc.ingredients ||
      primary.ingredients ||
      [];
    const instructions =
      doc.instructions ||
      primary.instructions ||
      (doc.description ? [String(doc.description)] : []);
    return { name, ingredients, instructions };
  };

  let recipe =
    {
      name: "Heirloom Tomato Burrata Salad",
      ingredients: [
        { name: "Heirloom tomatoes", category: "vegetable" },
        { name: "Fresh burrata", category: "dairy" },
        { name: "Basil leaves", category: "herb" },
        { name: "Olive oil", category: "fat" },
        { name: "Sea salt", category: "spice" },
      ],
      instructions: [
        "Slice tomatoes into rounds",
        "Nestle burrata in center",
        "Drizzle olive oil and sprinkle salt",
        "Garnish with fresh basil leaves",
      ],
    };

  // If ES vars set, fetch the recipe document to use as prompt
  if (ELASTIC_URL && ELASTIC_API_KEY && ELASTIC_INDEX && ELASTIC_ID) {
    try {
      const endpoint = `${ELASTIC_URL.replace(/\/$/, "")}/${ELASTIC_INDEX}/_source/${ELASTIC_ID}?pretty`;
      console.log(`Fetching recipe from ES: ${endpoint}`);
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `ApiKey ${ELASTIC_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      const text = await res.text();
      if (!res.ok) {
        console.error("❌ ES fetch failed", res.status, text);
      } else {
        const doc = JSON.parse(text);
        const built = buildRecipeFromDoc(doc);
        if (built) {
          recipe = built;
          console.log(`Using recipe from ES: ${recipe.name}`);
        } else {
          console.warn("⚠️ Could not build recipe from ES doc, using fallback.");
        }
      }
    } catch (err) {
      console.error("❌ Error fetching recipe from ES, using fallback:", err);
    }
  }

  try {
    console.log("Requesting image from Leonardo...");
    const url = await generateMealImage(recipe);
    console.log("✅ Image URL:", url);

    // If ES env vars provided, patch the document with the image URL
    const { ELASTIC_URL, ELASTIC_API_KEY, ELASTIC_INDEX, ELASTIC_ID } = process.env;
    if (ELASTIC_URL && ELASTIC_API_KEY && ELASTIC_INDEX && ELASTIC_ID) {
      console.log("Patching Elasticsearch document with image...");
      const endpoint = `${ELASTIC_URL.replace(/\/$/, "")}/${ELASTIC_INDEX}/_update/${ELASTIC_ID}?pretty`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${ELASTIC_API_KEY}`,
        },
        body: JSON.stringify({
          doc: {
            image: url,
            imageUrl: url,
          },
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error("❌ ES update failed", res.status, text);
      } else {
        console.log("✅ ES update response:", text);
      }
    } else {
      console.log("Skipping ES update (set ELASTIC_URL, ELASTIC_API_KEY, ELASTIC_INDEX, ELASTIC_ID to enable).");
    }
  } catch (err) {
    console.error("❌ Generation failed:", err);
  }
}

main();
