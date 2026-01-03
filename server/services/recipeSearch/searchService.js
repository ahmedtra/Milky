const { client, recipeIndex } = require('./elasticsearchClient');
const { ensureRecipeIndex } = require('./indexManagement');

const parseNumeric = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const match = val.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
};

const normalizeNutrition = (src = {}) => {
  const nutrition = {};
  const nSrc = src.nutrition || {};
  const pick = (...candidates) => {
    for (const val of candidates) {
      const num = parseNumeric(val);
      if (num !== null) return num;
    }
    return null;
  };

  const calories = pick(nSrc.calories, src.calories, src.total_calories);
  const protein = pick(
    nSrc.protein,
    nSrc.protein_g,
    src.protein,
    src.protein_g,
    src.protein_grams
  );
  const carbs = pick(nSrc.carbs, nSrc.carbs_g, src.carbs, src.carbs_g, src.carbs_grams);
  const fat = pick(nSrc.fat, nSrc.fat_g, src.fat, src.fat_g, src.fat_grams);
  const fiber = pick(nSrc.fiber, nSrc.fiber_g, src.fiber, src.fiber_g, src.fiber_grams);
  const sugar = pick(nSrc.sugar, nSrc.sugar_g, src.sugar, src.sugar_g, src.sugar_grams);

  if (calories !== null) nutrition.calories = calories;
  if (protein !== null) nutrition.protein = protein;
  if (carbs !== null) nutrition.carbs = carbs;
  if (fat !== null) nutrition.fat = fat;
  if (fiber !== null) nutrition.fiber = fiber;
  if (sugar !== null) nutrition.sugar = sugar;
  return nutrition;
};

const normalizeCuisine = (value) => {
  if (!value) return null;
  return String(value).toLowerCase().replace(/\s+/g, '_');
};

const macroFilters = (macro) => {
  switch (macro) {
    case 'high_protein':
      return [{ terms: { protein_bucket: ['high', 'very_high'] } }];
    case 'low_carb':
      return [{ terms: { calories_bucket: ['low'], protein_bucket: ['high', 'moderate'] } }];
    case 'high_carb':
      return [{ terms: { calories_bucket: ['medium', 'high'] } }];
    default:
      return [];
  }
};

const buildQuery = (filters = {}) => {
  const bool = { must: [], filter: [], must_not: [], should: [] };

  const addRangeFilter = (fields = [], range = {}) => {
    if (!fields.length || !Object.keys(range).length) return;
    const should = fields
      .filter(Boolean)
      .map((field) => ({ range: { [field]: range } }));
    if (should.length) {
      bool.filter.push({ bool: { should, minimum_should_match: 1 } });
    }
  };

  if (filters.text) {
    bool.must.push({
      multi_match: {
        query: filters.text,
        fields: ['title^3', 'description^2', 'ingredients_raw', 'instructions'],
        type: 'best_fields'
      }
    });
  }

  if (filters.title_exact) {
    bool.filter.push({ term: { 'title.raw': filters.title_exact } });
  }

  // Support both legacy dietary_tags and canonical diet_tags stored in the index
  const dietTags = filters.dietary_tags || filters.diet_tags;
  if (dietTags?.length) {
    bool.filter.push({
      bool: {
        should: [
          { terms: { dietary_tags: dietTags } }, // legacy
          { terms: { diet_tags: dietTags } }     // canonical
        ],
        minimum_should_match: 1
      }
    });
  }

  if (filters.include_ingredients?.length) {
    bool.filter.push({ terms: { ingredients_norm: filters.include_ingredients } });
  }

  if (filters.exclude_ingredients?.length) {
    bool.must_not.push({ terms: { ingredients_norm: filters.exclude_ingredients } });
    bool.must_not.push({ terms: { allergens: filters.exclude_ingredients } });
    filters.exclude_ingredients.forEach((term) => {
      if (!term) return;
      bool.must_not.push({
        multi_match: {
          query: term,
          fields: ['title^2', 'ingredients_raw'],
          type: 'phrase'
        }
      });
    });
  }

  if (filters.meal_type) {
    bool.filter.push({ term: { meal_type: filters.meal_type } });
  }

  if (filters.cuisine) {
    bool.filter.push({ term: { cuisine: filters.cuisine } });
  }

  if (filters.quick === true) {
    bool.filter.push({ term: { quick: true } });
  }

  if (filters.course) {
    bool.filter.push({ term: { course: filters.course } });
  }

  if (filters.max_total_time_min) {
    bool.filter.push({ range: { total_time_minutes: { lte: filters.max_total_time_min } } });
  } else if (filters.max_prep_time_minutes) {
    bool.filter.push({ range: { prep_time_minutes: { lte: filters.max_prep_time_minutes } } });
  }

  if (filters.calorie_target) {
    const target = Number(filters.calorie_target);
    if (!Number.isNaN(target)) {
      const tolerance = Math.max(25, Math.round(target * 0.1));
      addRangeFilter(
        ['calories', 'nutrition.calories'],
        {
          gte: Math.max(0, target - tolerance),
          lte: target + tolerance
        }
      );
    }
  }

  if (filters.calories_range) {
    const { gte, lte } = filters.calories_range;
    const range = {};
    if (Number.isFinite(gte)) range.gte = gte;
    if (Number.isFinite(lte)) range.lte = lte;
    addRangeFilter(['calories', 'nutrition.calories'], range);
  }

  if (filters.protein_g_range) {
    const { gte, lte } = filters.protein_g_range;
    const range = {};
    if (Number.isFinite(gte)) range.gte = gte;
    if (Number.isFinite(lte)) range.lte = lte;
    addRangeFilter(['protein_grams', 'protein_g', 'nutrition.protein'], range);
  }

  macroFilters(filters.macro_focus).forEach((f) => bool.filter.push(f));

  if (filters.activity_fit) {
    bool.should.push({ term: { activity_fit: filters.activity_fit } });
  }

  if (filters.goal_fit) {
    bool.should.push({ term: { goal_fit: filters.goal_fit } });
  }

  if (!bool.must.length && !bool.filter.length && !bool.must_not.length) {
    return { match_all: {} };
  }

  return { bool };
};

const searchRecipes = async (filters = {}, options = {}) => {
  await ensureRecipeIndex();

  const size = Math.min(options.size || 50, 200);
  const query = buildQuery(filters);
  const hasVector = Array.isArray(filters.query_vector) && filters.query_vector.length > 0;
  const knnClause = hasVector
    ? {
        field: 'embedding',
        query_vector: filters.query_vector,
        k: Math.min(size * 5, 500),
        num_candidates: Math.min(size * 10, 1000)
      }
    : null;

  // Randomize results using _seq_no to avoid fielddata on _id; can disable with options.randomize=false.
  // Seed is randomized per call unless explicitly provided.
  const randomSeed = options.randomSeed ?? Math.floor(Math.random() * 1_000_000_000);
  const finalQuery = options.randomize === false
    ? query
    : {
        function_score: {
          query,
          random_score: { seed: randomSeed, field: '_seq_no' },
          boost_mode: 'replace'
        }
      };

  const response = await client.search({
    index: recipeIndex,
    size,
    query: hasVector ? query : finalQuery,
    ...(knnClause ? { knn: knnClause } : {}),
    track_total_hits: true,
    _source: {
      excludes: ['raw']
    }
  });

  if (options.logSearch) {
    const preview = (response?.hits?.hits || []).slice(0, 5).map((h) => {
      const src = h._source || {};
      return {
        id: h._id,
        title: src.title,
        calories: src.nutrition?.calories ?? src.calories,
        protein: src.nutrition?.protein ?? src.protein ?? src.protein_grams ?? src.protein_g,
        carbs: src.nutrition?.carbs ?? src.carbs ?? src.carbs_g ?? src.carbs_grams,
        fat: src.nutrition?.fat ?? src.fat ?? src.fat_g ?? src.fat_grams,
        fiber: src.nutrition?.fiber ?? src.fiber ?? src.fiber_g ?? src.fiber_grams,
        sugar: src.nutrition?.sugar ?? src.sugar ?? src.sugar_g ?? src.sugar_grams
      };
    });
    console.log('🔎 ES search', {
      size,
      hasVector,
      totalHits: response?.hits?.total?.value || 0,
      filters: { ...filters, query_vector: hasVector ? '[vector]' : undefined },
      preview
    });
  }

  const hits = response?.hits?.hits || [];
  return {
    took: response?.took,
    total: response?.hits?.total?.value || 0,
    results: hits.map((hit) => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      // Expose a normalized nutrition snapshot so downstream consumers can
      // rely on either canonical fields or legacy *_g fields.
      nutrition: normalizeNutrition(hit._source)
    }))
  };
};

const getRecipeById = async (id) => {
  if (!id) return null;
  await ensureRecipeIndex();

  try {
    const res = await client.get({ index: recipeIndex, id });
    return res?._source ? { id: res._id, ...res._source } : null;
  } catch (error) {
    if (error?.meta?.statusCode === 404) {
      return null;
    }
    throw error;
  }
};

const findAlternatives = async ({
  mealType,
  cuisine,
  dietType,
  allergies = [],
  dislikedFoods = [],
  excludeIds = [],
  size = 3
} = {}) => {
  const exclusionSet = new Set(
    [...allergies, ...dislikedFoods]
      .map((item) => item && String(item).toLowerCase())
      .filter(Boolean)
  );

  const filters = {
    meal_type: mealType,
    exclude_ingredients: Array.from(exclusionSet)
  };

  const normalizedCuisine = normalizeCuisine(cuisine);
  if (normalizedCuisine) {
    filters.cuisine = normalizedCuisine;
  }

  if (dietType) {
    filters.diet_tags = [String(dietType).toLowerCase()];
  }

  const { results } = await searchRecipes(filters, { size: Math.max(size * 3, 12) });

  const seenIds = new Set(excludeIds.filter(Boolean));
  const unique = [];
  for (const hit of results) {
    if (seenIds.has(hit.id)) continue;
    unique.push(hit);
    seenIds.add(hit.id);
    if (unique.length >= size) break;
  }

  return unique;
};

module.exports = {
  searchRecipes,
  buildQuery,
  getRecipeById,
  findAlternatives
};
