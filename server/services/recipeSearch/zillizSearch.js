const { milvus, VECTOR_FIELD, ZILLIZ_COLLECTION, VECTOR_DIM } = require("./zillizClient");
const { getQueryEmbedding } = require("./embeddingProvider");

// Helpers to normalize filters
const cleanList = (arr = []) =>
  (Array.isArray(arr) ? arr : [arr])
    .map((v) => (typeof v === "string" ? v.toLowerCase().trim() : v))
    .filter((v) => v && v !== "null");

const normalizeCuisine = (value) => {
  if (!value) return null;
  if (String(value).toLowerCase() === "null") return null;
  return String(value).toLowerCase().replace(/\s+/g, "_");
};

// Rehydrate doc from payload or flattened fields
const rehydrateDoc = (hit) => {
  // If payload is present, prefer it for full fidelity
  if (hit.payload) {
    try {
      const obj = JSON.parse(hit.payload);
      if (obj && typeof obj === "object") return { ...obj, _id: hit.id };
    } catch (err) {
      // fallback below
    }
  }
  // Fallback: rebuild from flattened fields
  const doc = { _id: hit.id };
  const copy = (field, as) => {
    if (hit[field] !== undefined) doc[as || field] = hit[field];
  };
  copy("title");
  copy("description");
  copy("cuisine");
  if (hit.meal_type) doc.meal_type = hit.meal_type.split(",").map((s) => s.trim()).filter(Boolean);
  if (hit.diet_tags) doc.diet_tags = hit.diet_tags.split(",").map((s) => s.trim()).filter(Boolean);
  copy("activity_fit");
  copy("goal_fit");
  copy("difficulty");
  copy("course");
  copy("source");
  copy("recipe_id");
  copy("url");
  copy("link");
  copy("image");
  copy("imageUrl");
  if (hit.ner) doc.ner = hit.ner.split(",").map((s) => s.trim()).filter(Boolean);
  copy("ingredients_raw");
  copy("directions");
  copy("instructions");
  copy("ingredients_norm");
  copy("ingredients_normalized");
  copy("allergens");
  if (hit.allergens) doc.allergens = hit.allergens.split(",").map((s) => s.trim()).filter(Boolean);
  copy("protein_grams");
  copy("cook_time_min");
  copy("cook_time_minutes");
  copy("prep_time_min");
  copy("prep_time_minutes");
  copy("total_time_min");
  copy("total_time_minutes");
  copy("high_protein");
  copy("low_carb");
  copy("kid_friendly");
  copy("quick");
  copy("one_pot");
  copy("enriched");
  copy("servings");
  copy("calories");
  copy("protein");
  copy("created_at");
  copy("enriched_at");
  copy("nutrition_calories");
  copy("nutrition_carbs");
  copy("nutrition_carbs_g");
  copy("nutrition_fat");
  copy("nutrition_fat_g");
  copy("nutrition_fiber");
  copy("nutrition_fiber_g");
  copy("nutrition_protein");
  copy("nutrition_protein_g");
  copy("nutrition_sugar");
  copy("nutrition_sugar_g");
  if (hit.ingredients_parsed_json) {
    try {
      doc.ingredients_parsed = JSON.parse(hit.ingredients_parsed_json);
    } catch {
      // ignore
    }
  }
  return doc;
};

// Build scalar filters for Milvus search
const buildScalarFilters = (filters = {}) => {
  const constraints = [];

  // Exact title
  if (filters.title_exact) {
    constraints.push({ field: "title", operator: "==", value: String(filters.title_exact) });
  }

  // Diet tags
  const dietTags = cleanList(filters.dietary_tags || filters.diet_tags);
  if (dietTags.length) {
    const clause = dietTags
      .map((tag) => `diet_tags like '%${tag}%'`)
      .join(" or ");
    constraints.push({ raw: `(${clause})` });
  }

  // Meal type
  if (filters.meal_type) {
    const meals = cleanList(filters.meal_type);
    const clause = meals
      .map((m) => `meal_type like '%${m}%'`)
      .join(" or ");
    constraints.push({ raw: `(${clause})` });
  }

  // Cuisine
  if (filters.cuisine) {
    const norm = normalizeCuisine(filters.cuisine);
    if (norm) constraints.push({ field: "cuisine", operator: "==", value: norm });
  }

  // Difficulty
  if (filters.difficulty) {
    constraints.push({ field: "difficulty", operator: "==", value: String(filters.difficulty) });
  }

  // Quick/course
  if (filters.quick === true) constraints.push({ field: "quick", operator: "==", value: true });
  if (filters.course) constraints.push({ field: "course", operator: "==", value: String(filters.course) });

  // Time ranges
  if (filters.max_total_time_min) {
    constraints.push({ field: "total_time_minutes", operator: "<=", value: Number(filters.max_total_time_min) });
  } else if (filters.max_prep_time_minutes) {
    constraints.push({ field: "prep_time_minutes", operator: "<=", value: Number(filters.max_prep_time_minutes) });
  }

  // Calorie/protein ranges
  if (filters.calories_range) {
    if (Number.isFinite(filters.calories_range.gte))
      constraints.push({ field: "calories", operator: ">=", value: Number(filters.calories_range.gte) });
    if (Number.isFinite(filters.calories_range.lte))
      constraints.push({ field: "calories", operator: "<=", value: Number(filters.calories_range.lte) });
  }
  if (filters.protein_g_range) {
    if (Number.isFinite(filters.protein_g_range.gte))
      constraints.push({ field: "protein", operator: ">=", value: Number(filters.protein_g_range.gte) });
    if (Number.isFinite(filters.protein_g_range.lte))
      constraints.push({ field: "protein", operator: "<=", value: Number(filters.protein_g_range.lte) });
  }

  // Include ingredients: allow any of the provided terms (OR) in ingredients_norm
  const includeIngredients = cleanList(filters.include_ingredients);
  if (includeIngredients.length) {
    const clause = includeIngredients
      .map((term) => `ingredients_norm like '%${term}%'`)
      .join(" or ");
    constraints.push({ raw: `(${clause})` });
  }

  // Exclude ingredients handled as a post-filter (to avoid strict SQL null semantics)
  // see searchRecipesZilliz for post-filter logic

  return constraints;
};

const searchRecipesZilliz = async (filters = {}, options = {}) => {
  const limit = Number(options.size || 10);
  const offset = Number(options.offset || 0);
  const seed = options.randomSeed || Math.floor(Math.random() * 1_000_000);

  let queryVec = null;
  if (filters.text) {
    const vec = await getQueryEmbedding(filters.text);
    if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) {
      throw new Error(
        `Query embedding missing or wrong dimension; expected ${VECTOR_DIM}, got ${Array.isArray(vec) ? vec.length : 'none'}`
      );
    }
    queryVec = vec;
  }

  // Build scalar filters
  const constraints = buildScalarFilters(filters);
  if (filters.__textFallback) {
    const tf = filters.__textFallback.replace(/"/g, '\\"');
    constraints.push({
      raw: `(title like "%${tf}%" or description like "%${tf}%" or ingredients_raw like "%${tf}%")`,
    });
  }
  const toClause = (c) => {
    if (c.raw) return c.raw;
    if (c.operator === "in") {
      const list = c.value.map((v) => `'${v}'`).join(",");
      return `${c.field} in [${list}]`;
    }
    if (c.operator === "like" || c.operator === "not like") {
      return `${c.field} ${c.operator === "not like" ? "not like" : "like"} '${c.value}'`;
    }
    const val = typeof c.value === "string" ? `'${c.value}'` : c.value;
    return `${c.field} ${c.operator} ${val}`;
  };
  const filterStr = constraints.length ? constraints.map(toClause).join(" and ") : "";
  // Always ensure collection is loaded
  await milvus.loadCollectionSync({ collection_name: ZILLIZ_COLLECTION });

  // If we don't have a query vector, do a purely scalar query via query() instead of search()
  // Helper to apply post-filter for excludes after rehydration
  const applyPostExcludes = (docs) => {
    const excludes = cleanList(filters.exclude_ingredients);
    if (!excludes.length) return docs;
    return docs.filter((doc) => {
      const haystack = [
        doc.ingredients_norm,
        doc.ingredients_raw,
        Array.isArray(doc.ingredients_parsed)
          ? doc.ingredients_parsed.map((i) => i?.name || "").join(" ")
          : "",
        Array.isArray(doc.allergens) ? doc.allergens.join(" ") : doc.allergens,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !excludes.some((term) => haystack.includes(term));
    });
  };

  if (!queryVec) {
    const res = await milvus.query({
      collection_name: ZILLIZ_COLLECTION,
      expr: filterStr,
      output_fields: ["payload"],
      limit,
      offset,
    });
    const hits = res?.data || [];
    const docs = hits.map((h) => rehydrateDoc(h));
    return applyPostExcludes(docs);
  }

  // Vector search (kNN)
  const res = await milvus.search({
    collection_name: ZILLIZ_COLLECTION,
    anns_field: VECTOR_FIELD,
    data: [queryVec],
    filter: filterStr,
    limit,
    offset,
    output_fields: ["payload"],
    metric_type: "COSINE",
    params: { ef: 200, random_seed: seed },
  });

  const hits = res?.results || [];
  const docs = hits.map((h) => rehydrateDoc(h));
  return applyPostExcludes(docs);
};

module.exports = {
  searchRecipesZilliz,
  rehydrateDoc,
};
