#!/usr/bin/env node
/**
 * Migrate vectors from Elasticsearch into a Zilliz (Milvus) collection.
 *
 * Requirements:
 *   npm install @zilliz/milvus2-sdk-node
 *
 * Env (.env):
 *   ELASTICSEARCH_NODE / ELASTICSEARCH_API_KEY / ELASTICSEARCH_USERNAME / ELASTICSEARCH_PASSWORD
 *   ELASTICSEARCH_RECIPE_INDEX (defaults to "recipes")
 *   ZILLIZ_ENDPOINT (e.g., https://your-cluster.api.<region>.zillizcloud.com or provided host)
 *   ZILLIZ_TOKEN    (cluster API token/password)
 *   ZILLIZ_COLLECTION (target collection name, e.g., "recipes")
 *   ZILLIZ_VECTOR_FIELD (defaults to "embedding")
 *   ZILLIZ_VECTOR_DIM   (defaults to 768)
 *
 * Usage:
 *   node server/scripts/migrateEsToZilliz.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { client: esClient, recipeIndex: defaultRecipeIndex } = require("../services/recipeSearch/elasticsearchClient");
const { MilvusClient, DataType } = require("@zilliz/milvus2-sdk-node");

const RECIPE_INDEX = process.env.ELASTICSEARCH_RECIPE_INDEX || defaultRecipeIndex || "recipes";
const rawEndpoint = process.env.ZILLIZ_ENDPOINT;
const ZILLIZ_ENDPOINT = rawEndpoint && /^https?:\/\//i.test(rawEndpoint)
  ? rawEndpoint
  : rawEndpoint
    ? `https://${rawEndpoint}.api.zillizcloud.com`
    : "";
const ZILLIZ_TOKEN = process.env.ZILLIZ_TOKEN;
const ZILLIZ_COLLECTION = process.env.ZILLIZ_COLLECTION || "recipes";
const VECTOR_FIELD = process.env.ZILLIZ_VECTOR_FIELD || "embedding";
const VECTOR_DIM = Number(process.env.ZILLIZ_VECTOR_DIM || 768);
const PAYLOAD_FIELD = "payload";
const MAX_PAYLOAD_LENGTH = 65000; // Milvus varchar max is 65535; stay under the limit

if (!ZILLIZ_ENDPOINT || !ZILLIZ_TOKEN) {
  console.error("❌ Missing ZILLIZ_ENDPOINT or ZILLIZ_TOKEN in .env");
  process.exit(1);
}

const BATCH_SIZE = 500; // ES page size

const milvus = new MilvusClient({
  address: ZILLIZ_ENDPOINT,
  token: ZILLIZ_TOKEN,
  ssl: true,
});

async function ensureCollection() {
  const collections = await milvus.showCollections();
  const exists = collections.data?.some((c) => c.name === ZILLIZ_COLLECTION);
  if (exists) {
    console.log(`ℹ️ Collection "${ZILLIZ_COLLECTION}" already exists.`);
    return;
  }

  console.log(`🛠️ Creating collection "${ZILLIZ_COLLECTION}" with dim=${VECTOR_DIM}`);
  await milvus.createCollection({
    collection_name: ZILLIZ_COLLECTION,
    fields: [
      {
        name: "id",
        data_type: DataType.VarChar,
        is_primary_key: true,
        max_length: 128,
        autoID: false,
      },
      {
        name: VECTOR_FIELD,
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM,
      },
      {
        name: "title",
        data_type: DataType.VarChar,
        max_length: 512,
        is_primary_key: false,
        autoID: false,
      },
      {
        name: "description",
        data_type: DataType.VarChar,
        max_length: 8192,
      },
      {
        name: "cuisine",
        data_type: DataType.VarChar,
        max_length: 128,
      },
      {
        name: "meal_type",
        data_type: DataType.VarChar,
        max_length: 256,
      },
      {
        name: "diet_tags",
        data_type: DataType.VarChar,
        max_length: 1024,
      },
      { name: "activity_fit", data_type: DataType.VarChar, max_length: 128 },
      { name: "goal_fit", data_type: DataType.VarChar, max_length: 128 },
      { name: "difficulty", data_type: DataType.VarChar, max_length: 64 },
      { name: "course", data_type: DataType.VarChar, max_length: 128 },
      { name: "source", data_type: DataType.VarChar, max_length: 256 },
      { name: "recipe_id", data_type: DataType.VarChar, max_length: 256 },
      { name: "url", data_type: DataType.VarChar, max_length: 2048 },
      { name: "link", data_type: DataType.VarChar, max_length: 2048 },
      { name: "image", data_type: DataType.VarChar, max_length: 2048 },
      { name: "imageUrl", data_type: DataType.VarChar, max_length: 2048 },
      { name: "ner", data_type: DataType.VarChar, max_length: 2000 },
      { name: "ingredients_raw", data_type: DataType.VarChar, max_length: 12000 },
      { name: "directions", data_type: DataType.VarChar, max_length: 12000 },
      { name: "instructions", data_type: DataType.VarChar, max_length: 12000 },
      { name: "ingredients_norm", data_type: DataType.VarChar, max_length: 12000 },
      { name: "ingredients_normalized", data_type: DataType.VarChar, max_length: 12000 },
      { name: "ingredients_parsed_json", data_type: DataType.VarChar, max_length: 16000 },
      { name: "recipes_images", data_type: DataType.VarChar, max_length: 4096 },
      { name: "allergens", data_type: DataType.VarChar, max_length: 1024 },
      { name: "protein_grams", data_type: DataType.Float },
      { name: "cook_time_min", data_type: DataType.Int64 },
      { name: "cook_time_minutes", data_type: DataType.Int64 },
      { name: "prep_time_min", data_type: DataType.Int64 },
      { name: "prep_time_minutes", data_type: DataType.Int64 },
      { name: "total_time_min", data_type: DataType.Int64 },
      { name: "total_time_minutes", data_type: DataType.Int64 },
      { name: "high_protein", data_type: DataType.Bool },
      { name: "low_carb", data_type: DataType.Bool },
      { name: "kid_friendly", data_type: DataType.Bool },
      { name: "quick", data_type: DataType.Bool },
      { name: "one_pot", data_type: DataType.Bool },
      { name: "enriched", data_type: DataType.Bool },
      { name: "servings", data_type: DataType.Int64 },
      { name: "calories", data_type: DataType.Float },
      { name: "protein", data_type: DataType.Float },
      { name: "nutrition_calories", data_type: DataType.Float },
      { name: "nutrition_carbs", data_type: DataType.Float },
      { name: "nutrition_carbs_g", data_type: DataType.Float },
      { name: "nutrition_fat", data_type: DataType.Float },
      { name: "nutrition_fat_g", data_type: DataType.Float },
      { name: "nutrition_fiber", data_type: DataType.Float },
      { name: "nutrition_fiber_g", data_type: DataType.Float },
      { name: "nutrition_protein", data_type: DataType.Float },
      { name: "nutrition_protein_g", data_type: DataType.Float },
      { name: "nutrition_sugar", data_type: DataType.Float },
      { name: "nutrition_sugar_g", data_type: DataType.Float },
      { name: "created_at", data_type: DataType.VarChar, max_length: 64 },
      { name: "enriched_at", data_type: DataType.VarChar, max_length: 64 },
      {
        name: PAYLOAD_FIELD,
        data_type: DataType.VarChar,
        max_length: MAX_PAYLOAD_LENGTH,
      },
    ],
  });

  // Create a basic vector index
  await milvus.createIndex({
    collection_name: ZILLIZ_COLLECTION,
    field_name: VECTOR_FIELD,
    index_name: `${VECTOR_FIELD}_idx`,
    index_type: "AUTOINDEX",
    metric_type: "COSINE",
  });
}

async function insertVectors(rows) {
  if (!rows.length) return;
  await milvus.insert({
    collection_name: ZILLIZ_COLLECTION,
    fields_data: rows,
  });
}

async function migrate() {
  await ensureCollection();

  console.log(`🚚 Migrating from ES index "${RECIPE_INDEX}" to Zilliz collection "${ZILLIZ_COLLECTION}"`);

  let total = 0;
  let scrollId = null;

  console.log(`🔍 Fetching first page from ES (${BATCH_SIZE} docs)...`);
  const first = await esClient.search({
    index: RECIPE_INDEX,
    size: BATCH_SIZE,
    scroll: "2m",
    _source: ["*", VECTOR_FIELD],
    query: { match_all: {} },
  });

  scrollId = first._scroll_id || first.body?._scroll_id;
  let hits = first.hits?.hits || first.body?.hits?.hits || [];
  console.log(`🔍 First page hits: ${hits.length}`);

  while (hits.length) {
    console.log(`🔄 Processing page with ${hits.length} hits...`);
    let skippedForVector = 0;
    const rows = hits
      .map((h) => {
        const vec = h._source?.[VECTOR_FIELD];
        if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) {
          skippedForVector += 1;
          return null;
        }
        const src = h._source || {};
        // Merge _source with fields (if present) to capture any excluded fields)
        const merged = { ...src };
        if (h.fields && typeof h.fields === "object") {
          Object.entries(h.fields).forEach(([k, v]) => {
            if (merged[k] === undefined) merged[k] = Array.isArray(v) && v.length === 1 ? v[0] : v;
          });
        }
        const payload = (() => {
          try {
            const json = JSON.stringify(merged) || "";
            if (json.length > MAX_PAYLOAD_LENGTH) {
              return json.slice(0, MAX_PAYLOAD_LENGTH);
            }
            return json;
          } catch {
            return "";
          }
        })();
        const ingredientsParsed = Array.isArray(merged.ingredients_parsed)
          ? JSON.stringify(merged.ingredients_parsed).slice(0, 16000)
          : "";
        const recipesImages = Array.isArray(merged.recipes)
          ? merged.recipes
              .map((r) => r?.image || r?.imageUrl)
              .filter(Boolean)
              .join(",")
              .slice(0, 4000)
          : "";
        const nutrition = merged.nutrition || {};
        return {
          id: String(h._id),
          [VECTOR_FIELD]: vec,
          title: merged.title || "",
          description: merged.description || "",
          cuisine: merged.cuisine || "",
          meal_type: Array.isArray(merged.meal_type) ? merged.meal_type.join(",") : (merged.meal_type || ""),
          diet_tags: Array.isArray(merged.diet_tags) ? merged.diet_tags.join(",") : (merged.diet_tags || ""),
          activity_fit: merged.activity_fit || "",
          goal_fit: merged.goal_fit || "",
          difficulty: merged.difficulty || "",
          course: merged.course || "",
          source: merged.source || "",
          recipe_id: merged.recipe_id || "",
          url: merged.url || "",
          link: merged.link || "",
          image: merged.image || "",
          imageUrl: merged.imageUrl || "",
          ner: Array.isArray(merged.ner) ? merged.ner.join(",") : (merged.ner || ""),
          ingredients_raw: merged.ingredients_raw || "",
          directions: merged.directions || "",
          instructions: Array.isArray(merged.instructions) ? merged.instructions.join("\n") : (merged.instructions || ""),
          ingredients_norm: merged.ingredients_norm || "",
          ingredients_normalized: merged.ingredients_normalized || "",
          ingredients_parsed_json: ingredientsParsed,
          recipes_images: recipesImages,
          allergens: Array.isArray(merged.allergens) ? merged.allergens.join(",") : (merged.allergens || ""),
          protein_grams: Number(merged.protein_grams || 0),
          cook_time_min: Number(merged.cook_time_min || 0),
          cook_time_minutes: Number(merged.cook_time_minutes || 0),
          prep_time_min: Number(merged.prep_time_min || 0),
          prep_time_minutes: Number(merged.prep_time_minutes || 0),
          total_time_min: Number(merged.total_time_min || 0),
          total_time_minutes: Number(merged.total_time_minutes || 0),
          high_protein: Boolean(merged.high_protein),
          low_carb: Boolean(merged.low_carb),
          kid_friendly: Boolean(merged.kid_friendly),
          quick: Boolean(merged.quick),
          one_pot: Boolean(merged.one_pot),
          enriched: Boolean(merged.enriched),
          servings: Number(merged.servings || 0),
          calories: Number(merged.calories || nutrition.calories || 0),
          protein: Number(merged.protein || nutrition.protein || 0),
          nutrition_calories: Number(nutrition.calories || 0),
          nutrition_carbs: Number(nutrition.carbs || 0),
          nutrition_carbs_g: Number(nutrition.carbs_g || 0),
          nutrition_fat: Number(nutrition.fat || 0),
          nutrition_fat_g: Number(nutrition.fat_g || 0),
          nutrition_fiber: Number(nutrition.fiber || 0),
          nutrition_fiber_g: Number(nutrition.fiber_g || 0),
          nutrition_protein: Number(nutrition.protein || 0),
          nutrition_protein_g: Number(nutrition.protein_g || 0),
          nutrition_sugar: Number(nutrition.sugar || 0),
          nutrition_sugar_g: Number(nutrition.sugar_g || 0),
          created_at: merged.created_at || "",
          enriched_at: merged.enriched_at || "",
          [PAYLOAD_FIELD]: payload,
        };
      })
      .filter(Boolean);

    console.log(`🔢 Rows to insert this page: ${rows.length}`);
    if (skippedForVector) {
      console.log(`⚠️ Skipped ${skippedForVector} hits due to missing/wrong-dim vector`);
    }
    if (rows.length) {
      await insertVectors(rows);
      total += rows.length;
      console.log(`✅ Inserted ${rows.length} vectors (total ${total})`);
    } else {
      console.log("⚠️ No valid rows on this page (vector missing or wrong dim).");
    }

    const next = await esClient.scroll({
      scroll: "2m",
      scroll_id: scrollId,
    });
    scrollId = next._scroll_id || next.body?._scroll_id;
    hits = next.hits?.hits || next.body?.hits?.hits || [];
  }

  console.log(`📦 Finalizing: loading collection "${ZILLIZ_COLLECTION}"`);
  await milvus.loadCollectionSync({ collection_name: ZILLIZ_COLLECTION });
  console.log(`🎉 Migration complete. Total vectors inserted: ${total}`);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  if (err?.response) console.error(err.response);
  process.exit(1);
});
