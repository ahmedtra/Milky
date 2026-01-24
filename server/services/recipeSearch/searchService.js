const { searchRecipesZilliz } = require('./zillizSearch');

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
  if (String(value).toLowerCase() === 'null') return null;
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
  const cleanList = (arr = []) =>
    (Array.isArray(arr) ? arr : [arr])
      .map((v) => (typeof v === 'string' ? v.toLowerCase().trim() : v))
      .filter((v) => v && v !== 'null');
  const expandExcludeIngredients = (items = []) => {
    const base = new Set(cleanList(items));
    const expanded = new Set(base);
    base.forEach((term) => {
      if (term.includes('pork')) {
        ['pork', 'ham', 'bacon', 'sausage', 'prosciutto', 'chorizo', 'lard', 'pancetta'].forEach((t) => expanded.add(t));
      }
      if (term.includes('shellfish')) {
        ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel'].forEach((t) => expanded.add(t));
      }
      if (term.includes('potato')) {
        ['potato', 'potatoes', 'russet', 'yukon gold', 'sweet potato', 'yam', 'fries', 'chips', 'hash brown', 'wedges'].forEach((t) =>
          expanded.add(t)
        );
      }
    });
    return Array.from(expanded);
  };

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
  const dietTags = cleanList(filters.dietary_tags || filters.diet_tags);
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

  const includeIngredients = cleanList(filters.include_ingredients);
  if (includeIngredients.length) {
    // To avoid picking the same preferred ingredient repeatedly, pick one as a required
    // "anchor" for this search and keep the rest as optional boosts. This lets upstream
    // callers run multiple queries and naturally rotate which preferred ingredient
    // becomes mandatory.
    const anchorIdx = Math.floor(Math.random() * includeIngredients.length);
    const anchor = includeIngredients[anchorIdx];
    const rest = includeIngredients.filter((_, i) => i !== anchorIdx);

    // Require the anchor ingredient in the normalized ingredients list
    bool.filter.push({ term: { ingredients_norm: anchor } });

    // Keep the others as optional should clauses so matches that contain them are boosted
    if (rest.length) {
      bool.should.push({
        bool: {
          should: rest.map((term) => ({ term: { ingredients_norm: term } })),
          minimum_should_match: 1
        }
      });
    }
  }

  const excludeIngredients = expandExcludeIngredients(filters.exclude_ingredients);
  if (excludeIngredients.length) {
    bool.must_not.push({ terms: { ingredients_norm: excludeIngredients } });
    bool.must_not.push({ terms: { allergens: excludeIngredients } });
    excludeIngredients.forEach((term) => {
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
    const normCuisine = normalizeCuisine(filters.cuisine);
    if (normCuisine) bool.filter.push({ term: { cuisine: normCuisine } });
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
  const size = Math.min(options.size || 50, 200);
  const logSearch = options.logSearch;
  if (logSearch) {
    console.log('🔎 searchRecipes input', {
      filters,
      size,
      offset: options.from || 0
    });
  }
  const docs = await searchRecipesZilliz(filters, { size, offset: options.from || 0 });
  const results = docs.map((doc) => ({
    ...doc,
    nutrition: normalizeNutrition(doc)
  }));
  if (logSearch) {
    console.log('🔎 searchRecipes results', {
      count: results.length,
      sampleTitles: results.slice(0, 3).map((r) => r.title || r.name),
      ids: results.slice(0, 5).map((r) => r.id || r._id)
    });
  } else if (results.length === 0) {
    console.warn('⚠️ searchRecipes returned 0 results', { filters, size, offset: options.from || 0 });
  }
  return {
    took: undefined,
    total: results.length,
    results
  };
};

const getRecipeById = async (id) => {
  if (!id) return null;
  const res = await searchRecipesZilliz({ title_exact: id }, { size: 1 });
  if (!res || !res.length) return null;
  const doc = res[0];
  return {
    ...doc,
    nutrition: normalizeNutrition(doc)
  };
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
  const expandExcludeIngredients = (items = []) => {
    const base = new Set(
      (Array.isArray(items) ? items : [items])
        .map((v) => v && String(v).toLowerCase().trim())
        .filter(Boolean)
    );
    const expanded = new Set(base);
    base.forEach((term) => {
      if (term.includes('pork')) {
        ['pork', 'ham', 'bacon', 'sausage', 'prosciutto', 'chorizo', 'lard', 'pancetta'].forEach((t) => expanded.add(t));
      }
      if (term.includes('shellfish')) {
        ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel'].forEach((t) => expanded.add(t));
      }
      if (term.includes('potato')) {
        ['potato', 'potatoes', 'russet', 'yukon gold', 'sweet potato', 'yam', 'fries', 'chips', 'hash brown', 'wedges'].forEach((t) =>
          expanded.add(t)
        );
      }
    });
    return Array.from(expanded);
  };

  const exclusionSet = new Set(
    expandExcludeIngredients([...allergies, ...dislikedFoods])
      .map((item) => item && String(item).toLowerCase().trim())
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
  getRecipeById,
  findAlternatives
};
