const { mapQueryToFiltersWithGemini } = require('./geminiStructured');

const DIET_KEYWORDS = {
  keto: ['keto', 'ketogenic'],
  vegan: ['vegan', 'plant-based'],
  vegetarian: ['vegetarian', 'veggie'],
  pescatarian: ['pescatarian', 'pescetarian'],
  gluten_free: ['gluten free', 'no gluten', 'celiac'],
  dairy_free: ['dairy free', 'lactose free', 'no dairy']
};

const CUISINE_KEYWORDS = {
  mediterranean: ['mediterranean'],
  italian: ['italian', 'pasta', 'risotto'],
  mexican: ['mexican', 'tacos', 'burrito'],
  indian: ['indian', 'curry', 'masala'],
  asian: ['asian'],
  thai: ['thai'],
  vietnamese: ['vietnamese', 'pho', 'banh mi'],
  korean: ['korean', 'kimchi'],
  japanese: ['japanese', 'sushi'],
  greek: ['greek'],
  french: ['french'],
  american: ['american'],
  middle_eastern: ['middle eastern', 'levant', 'shawarma']
};

const MEAL_TYPE_KEYWORDS = {
  breakfast: ['breakfast', 'morning', 'brunch'],
  lunch: ['lunch', 'midday'],
  dinner: ['dinner', 'supper', 'evening'],
  snack: ['snack', 'snacking']
};

const MACRO_KEYWORDS = {
  high_protein: ['high protein', 'lots of protein', 'protein heavy'],
  low_carb: ['low carb', 'keto friendly', 'cut carbs'],
  balanced: ['balanced', 'normal macros', 'regular'],
  high_carb: ['high carb', 'carb load']
};

const SPEED_KEYWORDS = [
  { terms: ['quick', 'fast', 'in a hurry', 'short'], maxPrep: 20 },
  { terms: ['30 minutes', '30 min', 'half an hour'], maxPrep: 30 }
];

const CALORIE_KEYWORDS = [
  { terms: ['light', 'low calorie', 'lean'], calorieTarget: 450 },
  { terms: ['filling', 'hearty'], calorieTarget: 700 }
];

const INGREDIENT_ALIASES = {
  chicken: ['chicken', 'chicken breast', 'rotisserie chicken'],
  beef: ['beef', 'steak'],
  salmon: ['salmon'],
  shrimp: ['shrimp', 'prawn'],
  tuna: ['tuna'],
  tofu: ['tofu'],
  chickpea: ['chickpea', 'chickpeas', 'garbanzo'],
  lentil: ['lentil', 'lentils'],
  broccoli: ['broccoli'],
  spinach: ['spinach'],
  peanut: ['peanut', 'peanuts'],
  shellfish: ['shellfish'],
  dairy: ['dairy', 'cheese', 'milk', 'cream']
};

const dedupe = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const matchKeywordMap = (text, map) => {
  const matches = [];
  for (const [key, variants] of Object.entries(map)) {
    if (variants.some((v) => text.includes(v))) {
      matches.push(key);
    }
  }
  return matches;
};

const findMealType = (text) => {
  for (const [mealType, variants] of Object.entries(MEAL_TYPE_KEYWORDS)) {
    if (variants.some((v) => text.includes(v))) return mealType;
  }
  return null;
};

const findCuisine = (text) => {
  for (const [cuisine, variants] of Object.entries(CUISINE_KEYWORDS)) {
    if (variants.some((v) => text.includes(v))) return cuisine;
  }
  return null;
};

const findSpeed = (text) => {
  for (const entry of SPEED_KEYWORDS) {
    if (entry.terms.some((t) => text.includes(t))) return entry.maxPrep;
  }
  return null;
};

const findCalories = (text) => {
  for (const entry of CALORIE_KEYWORDS) {
    if (entry.terms.some((t) => text.includes(t))) return entry.calorieTarget;
  }
  return null;
};

const findMacros = (text) => {
  for (const [macro, variants] of Object.entries(MACRO_KEYWORDS)) {
    if (variants.some((v) => text.includes(v))) return macro;
  }
  return null;
};

const findIngredientsFromAliases = (text) => {
  const matches = [];
  for (const [canonical, variants] of Object.entries(INGREDIENT_ALIASES)) {
    if (variants.some((v) => text.includes(v))) matches.push(canonical);
  }
  return matches;
};

const mergeFilters = (base = {}, addition = {}) => {
  return {
    dietary_tags: dedupe([...(base.dietary_tags || []), ...(addition.dietary_tags || [])]),
    include_ingredients: dedupe([...(base.include_ingredients || []), ...(addition.include_ingredients || [])]),
    exclude_ingredients: dedupe([...(base.exclude_ingredients || []), ...(addition.exclude_ingredients || [])]),
    meal_type: addition.meal_type || base.meal_type || null,
    cuisine: addition.cuisine || base.cuisine || null,
    max_prep_time_minutes: addition.max_prep_time_minutes || base.max_prep_time_minutes || null,
    calorie_target: addition.calorie_target || base.calorie_target || null,
    macro_focus: addition.macro_focus || base.macro_focus || null,
    text: addition.text || base.text || null
  };
};

const parseDeterministic = (query, baseFilters = {}) => {
  const text = (query || '').toLowerCase().trim();
  if (!text) return { filters: mergeFilters(baseFilters, { text }), confidence: 0.35 };

  const dietary_tags = matchKeywordMap(text, DIET_KEYWORDS);
  const meal_type = findMealType(text);
  const cuisine = findCuisine(text);
  const include_ingredients = findIngredientsFromAliases(text);
  const macro_focus = findMacros(text);
  const max_prep_time_minutes = findSpeed(text);
  const calorie_target = findCalories(text);

  // Simple exclusion detection: look for "no X" or "without X"
  const exclude_ingredients = [];
  const exclusionMatches = text.match(/(?:no|without|avoid) ([a-z\s]+)/g);
  if (exclusionMatches) {
    exclusionMatches.forEach((phrase) => {
      const cleaned = phrase.replace(/(?:no|without|avoid) /, '').trim();
      const aliasHits = findIngredientsFromAliases(cleaned);
      if (aliasHits.length) {
        exclude_ingredients.push(...aliasHits);
      } else {
        exclude_ingredients.push(cleaned.split(' ')[0]);
      }
    });
  }

  let confidence = 0.5;
  if (dietary_tags.length) confidence += 0.15;
  if (meal_type) confidence += 0.1;
  if (cuisine) confidence += 0.1;
  if (include_ingredients.length) confidence += 0.05;
  if (exclude_ingredients.length) confidence += 0.05;
  if (max_prep_time_minutes) confidence += 0.05;
  if (macro_focus) confidence += 0.05;

  const filters = mergeFilters(baseFilters, {
    dietary_tags,
    meal_type,
    cuisine,
    include_ingredients,
    exclude_ingredients,
    max_prep_time_minutes,
    calorie_target,
    macro_focus,
    text
  });

  return { filters, confidence: Math.min(confidence, 0.95) };
};

const parseQueryToFilters = async (query, baseFilters = {}) => {
  const deterministic = parseDeterministic(query, baseFilters);

  // If we are already confident enough or no query text, skip LLM to preserve latency.
  if (deterministic.confidence >= 0.75 || !query) {
    return { ...deterministic, usedLLM: false };
  }

  const llmResult = await mapQueryToFiltersWithGemini(query, deterministic.filters);
  const merged = mergeFilters(deterministic.filters, llmResult.filters);

  return {
    filters: merged,
    confidence: Math.max(deterministic.confidence, llmResult.confidence || 0.8),
    usedLLM: llmResult.usedLLM
  };
};

module.exports = {
  parseQueryToFilters
};
