const { GoogleGenerativeAI } = require('@google/generative-ai');
const { searchRecipes, getRecipeById } = require('./recipeSearch/searchService');
const { logEvent } = require('../utils/logger');
const { groqChat } = require('./groqClient');
// Node 18+ has global fetch; no import required.

const EMBED_HOST = process.env.EMBEDDING_HOST || process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const LOG_MEALPLAN = process.env.LOG_MEALPLAN === 'true';
const logMealplan = (...args) => {
  if (LOG_MEALPLAN) console.log(...args);
};
const buildQueryVector = async (text) => {
  if (!text) return null;

  // 1) Nomic hosted embeddings (keeps dims compatible with nomic-embed-text: 768)
  if (process.env.NOMIC_API_KEY) {
    const nomicPayload = {
      model: process.env.NOMIC_EMBED_MODEL || 'nomic-embed-text-v1',
      texts: [text.slice(0, 2000)],
      long_text_mode: 'mean'
    };
    const nomicHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.NOMIC_API_KEY}`
    };
    try {
      const res = await fetch('https://api-atlas.nomic.ai/v1/embedding/text', {
        method: 'POST',
        headers: nomicHeaders,
        body: JSON.stringify(nomicPayload)
      });
      if (!res.ok) throw new Error(`Nomic embed failed ${res.status}`);
      const data = await res.json();
      const vector = data?.embeddings?.[0];
      if (Array.isArray(vector)) {
        logMealplan('✅ Nomic embedding success', { model: nomicPayload.model, dims: vector.length });
        return vector;
      }
    } catch (err) {
      console.warn('⚠️ Nomic query embedding failed:', err.message);
    }
  }

  // 2) OpenAI embeddings if available (note: dims differ, requires matching index)
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          input: text.slice(0, 2000),
          model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
        })
      });
      if (!res.ok) throw new Error(`OpenAI embed failed ${res.status}`);
      const data = await res.json();
      const vector = data?.data?.[0]?.embedding;
      if (Array.isArray(vector)) return vector;
    } catch (err) {
      console.warn('⚠️ OpenAI query embedding failed:', err.message);
    }
  }

  // 3) Local/hosted Ollama embedding path
  try {
    const res = await fetch(`${EMBED_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 2000) })
    });
    if (!res.ok) throw new Error(`Embed failed ${res.status}`);
    const data = await res.json();
    return data?.embedding || null;
  } catch (err) {
    console.warn('⚠️ Query embedding failed:', err.message);
    return null;
  }
};

// Ingredient pools used to build a randomised blueprint before calling Gemini
const INGREDIENT_LIBRARY = {
  breakfast: [
    { name: 'Rolled oats', category: 'grain' },
    { name: 'Greek yogurt', category: 'dairy' },
    { name: 'Chia seeds', category: 'seed' },
    { name: 'Almond butter', category: 'nut' },
    { name: 'Banana', category: 'fruit' },
    { name: 'Blueberries', category: 'fruit' },
    { name: 'Eggs', category: 'protein' },
    { name: 'Spinach', category: 'vegetable' },
    { name: 'Whole grain bread', category: 'grain' },
    { name: 'Avocado', category: 'fat' },
    { name: 'Ricotta cheese', category: 'dairy' },
    { name: 'Smoked salmon', category: 'protein' },
    { name: 'Sun-dried tomatoes', category: 'vegetable' },
    { name: 'Pesto', category: 'fat' },
    { name: 'Mango', category: 'fruit' },
    { name: 'Coconut yogurt', category: 'dairy' },
    { name: 'Granola', category: 'grain' },
    { name: 'Hazelnuts', category: 'nut' },
    { name: 'Matcha powder', category: 'other' },
    { name: 'Buckwheat flour', category: 'grain' }
  ],
  lunch: [
    { name: 'Quinoa', category: 'grain' },
    { name: 'Brown rice', category: 'grain' },
    { name: 'Chicken breast', category: 'protein' },
    { name: 'Chickpeas', category: 'protein' },
    { name: 'Black beans', category: 'protein' },
    { name: 'Mixed greens', category: 'vegetable' },
    { name: 'Cherry tomatoes', category: 'vegetable' },
    { name: 'Cucumber', category: 'vegetable' },
    { name: 'Feta cheese', category: 'dairy' },
    { name: 'Salmon', category: 'protein' },
    { name: 'Arugula', category: 'vegetable' },
    { name: 'Farro', category: 'grain' },
    { name: 'Roasted red peppers', category: 'vegetable' },
    { name: 'Halloumi', category: 'dairy' },
    { name: 'Bulgur wheat', category: 'grain' },
    { name: 'Kimchi', category: 'vegetable' },
    { name: 'Seaweed salad', category: 'vegetable' },
    { name: 'Toasted sesame seeds', category: 'seed' },
    { name: 'Tzatziki', category: 'dairy' },
    { name: 'Roasted eggplant', category: 'vegetable' }
  ],
  dinner: [
    { name: 'Sweet potato', category: 'vegetable' },
    { name: 'Broccoli', category: 'vegetable' },
    { name: 'Lean beef', category: 'protein' },
    { name: 'Turkey mince', category: 'protein' },
    { name: 'Tofu', category: 'protein' },
    { name: 'Lentils', category: 'protein' },
    { name: 'Brown rice', category: 'grain' },
    { name: 'Whole wheat pasta', category: 'grain' },
    { name: 'Zucchini', category: 'vegetable' },
    { name: 'Bell pepper', category: 'vegetable' },
    { name: 'Cauliflower', category: 'vegetable' },
    { name: 'Shrimp', category: 'protein' },
    { name: 'Miso paste', category: 'other' },
    { name: 'Coconut milk', category: 'fat' },
    { name: 'Bok choy', category: 'vegetable' },
    { name: 'Brown lentil pasta', category: 'grain' },
    { name: 'Paneer', category: 'protein' },
    { name: 'Harissa', category: 'other' },
    { name: 'Polenta', category: 'grain' },
    { name: 'Roasted garlic', category: 'vegetable' }
  ],
  snack: [
    { name: 'Carrot sticks', category: 'vegetable' },
    { name: 'Hummus', category: 'protein' },
    { name: 'Apple', category: 'fruit' },
    { name: 'Mixed nuts', category: 'nut' },
    { name: 'Rice cakes', category: 'grain' },
    { name: 'Cottage cheese', category: 'dairy' },
    { name: 'Edamame', category: 'protein' },
    { name: 'Berries', category: 'fruit' },
    { name: 'Dark chocolate squares', category: 'other' },
    { name: 'Roasted chickpeas', category: 'protein' },
    { name: 'Apple butter', category: 'other' },
    { name: 'Matcha energy bites', category: 'other' },
    { name: 'Spiced almonds', category: 'nut' },
    { name: 'Seaweed crisps', category: 'vegetable' },
    { name: 'Protein yoghurt drink', category: 'dairy' }
  ]
};

const CUISINE_OPTIONS = [
  'Mediterranean',
  'Italian',
  'French',
  'Moroccan',
  'Japanese',
  'Thai',
  'Vietnamese',
  'Korean',
  'Mexican',
  'Middle Eastern',
  'Nordic',
  'Indian',
  'Spanish',
  'Greek',
  'Caribbean'
];

const LOG_SEARCH = process.env.LOG_SEARCH === 'true';

const FALLBACK_NAME_TEMPLATES = {
  breakfast: [
    '{cuisine} Sunrise {main}',
    '{main} & {second} {cuisine} Morning Plate',
    '{cuisine} Daybreak {course} with {main}',
    '{cuisine} Brunch-style {main} Stack'
  ],
  lunch: [
    '{cuisine} Midday {main} Platter',
    '{main} & {second} {cuisine} Lunch Tray',
    '{cuisine} Market {course} featuring {main}',
    '{cuisine} Bistro {main} Bowl'
  ],
  dinner: [
    '{cuisine} Evening {main} Feast',
    '{main} & {second} {cuisine} Supper',
    '{cuisine} Hearth {course} with {main}',
    '{cuisine} Nightfall {main} Plate'
  ],
  snack: [
    '{cuisine} Snack Bites with {main}',
    '{cuisine} Afternoon {main} Nibbles',
    '{main} & {second} {cuisine} Treat',
    '{cuisine} Street Snack: {main}'
  ],
  default: ['{cuisine} {course} with {main}']
};

// Removed the problematic text extraction function that was causing parsing issues

class GeminiService {
  constructor() {
    this.useOllama = process.env.USE_OLLAMA_FOR_MEALPLAN === 'true';
    this.provider =
      (process.env.AI_PROVIDER && process.env.AI_PROVIDER.toLowerCase()) ||
      (process.env.MEALPLAN_PROVIDER && process.env.MEALPLAN_PROVIDER.toLowerCase()) ||
      (this.useOllama ? 'ollama' : 'gemini');
    this.ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct-q4_0';
    this.groqModel = process.env.MEALPLAN_GROQ_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (this.provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
      }
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: this.geminiModel });
    } else if (this.provider === 'groq') {
      if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY environment variable is not set for Groq meal generation');
      }
    }

    // Log active provider once at startup to aid debugging of latency and model selection
    logMealplan(
      `🤖 Meal generation provider: ${this.provider} ` +
      (this.provider === 'gemini'
        ? `(model=${this.geminiModel})`
        : this.provider === 'groq'
          ? `(model=${this.groqModel})`
          : `(model=${this.ollamaModel} @ ${this.ollamaHost})`)
    );
  }

  /**
   * Fetch candidate recipes from Elasticsearch for a given meal type and preferences.
   * This keeps the LLM grounded on existing recipes rather than inventing new ones.
   */
  detectCuisineFromNotes(notes) {
    if (!notes || typeof notes !== 'string') return null;
    const text = notes.toLowerCase();
    const known = CUISINE_OPTIONS.map(c => c.toLowerCase());
    return known.find(c => text.includes(c)) || null;
  }

  async fetchCandidatesForMeal(mealType, preferences, size = 5) {
    const tStart = Date.now();
    let filterMs = 0;
    let vectorMs = 0;
    let searchMs = 0;
    const cuisinePref = preferences?.cuisine
      || preferences?.preferredCuisine
      || this.detectCuisineFromNotes(preferences?.additionalNotes);
    // Expand disliked/allergy terms with common synonyms (e.g., pork family)
    const baseExcludes = new Set([...(preferences?.allergies || []), ...(preferences?.dislikedFoods || [])].map((v) => v && v.toLowerCase()).filter(Boolean));
    const excludeExpanded = new Set(baseExcludes);
    baseExcludes.forEach((term) => {
      if (term.includes('pork')) {
        ['pork', 'ham', 'bacon', 'sausage', 'prosciutto', 'chorizo', 'lard', 'pancetta'].forEach((t) => excludeExpanded.add(t));
      }
      if (term.includes('shellfish')) {
        ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel'].forEach((t) => excludeExpanded.add(t));
      }
      if (term.includes('potato')) {
        ['potato', 'potatoes', 'russet', 'yukon gold', 'sweet potato', 'yam', 'fries', 'chips', 'hash brown', 'wedges'].forEach((t) =>
          excludeExpanded.add(t)
        );
      }
    });
    const excludeList = Array.from(excludeExpanded);
    const tFiltersStart = Date.now();
    // Build filters via LLM; fallback to deterministic if it fails
    let filters = await this.buildEsFiltersWithGemini(mealType, preferences);
    if (!filters) {
      filters = {
        meal_type: mealType,
        diet_tags: preferences?.dietType ? [preferences.dietType].filter(Boolean) : [],
        include_ingredients: preferences?.includeIngredients || [],
        exclude_ingredients: excludeList,
        cuisine: cuisinePref || null,
        max_total_time_min: preferences?.maxTotalTimeMin || null,
        calories_range: preferences?.caloriesRange || null,
        protein_g_range: preferences?.proteinRange || null,
        goal_fit: preferences?.goals ? String(preferences.goals).toLowerCase() : null,
        activity_fit: preferences?.activityLevel ? String(preferences.activityLevel).toLowerCase() : null
      };
    }
    filterMs = Date.now() - tFiltersStart;

    // Optional semantic query vector from free-text preference notes
    const freeText = preferences?.recipeQuery || preferences?.additionalNotes || '';
    const tVecStart = Date.now();
    const queryVector = await buildQueryVector(freeText);
    if (queryVector) {
      filters = { ...filters, text: freeText, query_vector: queryVector };
    } else if (freeText) {
      filters = { ...filters, text: freeText };
    }
    vectorMs = Date.now() - tVecStart;

    
    const randomSeed = Date.now() + Math.floor(Math.random() * 1_000_000);
    const tSearchStart = Date.now();
    let results = await searchRecipes(filters, { size, randomSeed, logSearch: LOG_SEARCH || LOG_MEALPLAN });
    // Attach nutrition snapshot so downstream consumers don't lose macros
    if (results?.results?.length) {
      results.results = results.results.map((r) => ({
        ...r,
        nutrition: this.extractNutritionFromSource(r)
      }));
    }
    // Fallback: if nothing returned and a diet filter was applied, retry without diet_tags
    if ((!results.results || results.results.length === 0) && filters.diet_tags?.length) {
      const relaxedFilters = { ...filters };
      delete relaxedFilters.diet_tags;
      delete relaxedFilters.dietary_tags;
      results = await searchRecipes(relaxedFilters, { size, logSearch: LOG_SEARCH || LOG_MEALPLAN });
      logMealplan(`⚠️ ${mealType} search empty with diet_tags, retried without diet tags`, {
        originalDietTags: filters.diet_tags,
        relaxedHits: results?.results?.length || 0
      });
    }
    // If ES still returns nothing, synthesize multiple fallback recipes via LLM to avoid empty candidates
    if (!results.results || results.results.length === 0) {
      const fallbackRecipes = await this.generateLLMFallbackRecipes(mealType, preferences, 10);
      if (fallbackRecipes?.length) {
        results.results = fallbackRecipes;
        logMealplan(`✨ Using LLM fallback recipes for ${mealType}`, {
          count: fallbackRecipes.length,
          titles: fallbackRecipes.map((r) => r.title)
        });
      }
    }
    logMealplan(`⏱️ searchRecipes(${mealType}) took ${Date.now() - tSearchStart} ms`);
    searchMs = Date.now() - tSearchStart;

    // Shuffle hits locally to avoid stable ordering when the pool is small
    // Drop candidates missing required fields (title + instructions + ingredients)
    const hasTitle = (r) => !!(r?.title && String(r.title).trim().length);
    const hasInstructions = (r) => {
      if (Array.isArray(r?.instructions)) return r.instructions.filter(Boolean).length > 0;
      return typeof r?.instructions === 'string' && r.instructions.trim().length > 0;
    };
    const hasIngredients = (r) => {
      return (
        (Array.isArray(r?.ingredients_parsed) && r.ingredients_parsed.length > 0) ||
        (Array.isArray(r?.ingredients_norm) && r.ingredients_norm.length > 0) ||
        (typeof r?.ingredients_raw === 'string' && r.ingredients_raw.trim().length > 0)
      );
    };
    const rawResults = (results.results || []).filter((r) => hasTitle(r) && hasInstructions(r) && hasIngredients(r));
    // Hard post-filter to enforce exclusions even if ES misses variants.
    // Include both user allergy/dislike expansion AND any LLM-proposed exclude_ingredients.
    const effectiveExcludes = new Set([
      ...excludeList,
      ...((filters?.exclude_ingredients || []).map((t) => t && t.toLowerCase()).filter(Boolean))
    ]);
    const loweredExcludes = Array.from(effectiveExcludes);
    const passesExcludes = (r) => {
      if (!loweredExcludes.length) return true;
      const haystack = [
        r.title,
        r.description,
        Array.isArray(r.ingredients_norm) ? r.ingredients_norm.join(' ') : '',
        Array.isArray(r.ingredients_parsed) ? r.ingredients_parsed.map((ing) => ing?.name).filter(Boolean).join(' ') : '',
        r.ingredients_raw,
        r.cuisine,
        r.meal_type
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !loweredExcludes.some((term) => term && haystack.includes(term));
    };

    let filtered = rawResults.filter(passesExcludes);
    // If all hits were filtered out, backfill with LLM recipes to avoid empty candidate lists
    if (!filtered.length) {
      console.log("generating LLM Fall back")
      const llmFallbacks = await this.generateLLMFallbackRecipes(mealType, preferences, 4);
      if (llmFallbacks.length) {
        logMealplan(`✨ All ${mealType} hits filtered out; injecting LLM candidates`, {
          count: llmFallbacks.length,
          titles: llmFallbacks.map((r) => r.title)
        });
        filtered = llmFallbacks;
      }
    }
    const shuffled = this.shuffle(filtered);
    logMealplan(`🍽️ Candidates fetched for ${mealType}: ${shuffled.length} (filtered from ${rawResults.length})`, {
      totalMs: Date.now() - tStart,
      filterMs,
      vectorMs,
      searchMs
    });
    // Light-weight peek to trace what we're returning (id/title/macros/ingredient coverage)
    logMealplan('🍽️ Candidates preview', shuffled.slice(0, 5).map((c) => ({
      id: c.id || c._id,
      title: c.title,
      calories: c.nutrition?.calories ?? c.calories,
      protein: c.nutrition?.protein ?? c.protein ?? c.protein_grams ?? c.protein_g,
      carbs: c.nutrition?.carbs,
      fat: c.nutrition?.fat,
      nutrition: c.nutrition,
      hasParsedIngredients: Array.isArray(c.ingredients_parsed) && c.ingredients_parsed.length,
      hasRawIngredients: typeof c.ingredients_raw === 'string' && !!c.ingredients_raw.trim()
    })));

    const buildNutrition = (src) => {
      const nutrition = {};
      const addNumber = (key, ...candidates) => {
        for (const val of candidates) {
          const num = Number(val);
          if (Number.isFinite(num)) {
            nutrition[key] = num;
            return;
          }
        }
      };
      const nSrc = src?.nutrition || src || {};
      addNumber('calories', nSrc.calories);
      addNumber('protein', nSrc.protein_g, nSrc.protein_grams, nSrc.protein);
      addNumber('carbs', nSrc.carbs_g, nSrc.carbs_grams, nSrc.carbs);
      addNumber('fat', nSrc.fat_g, nSrc.fat_grams, nSrc.fat);
      addNumber('fiber', nSrc.fiber_g, nSrc.fiber_grams, nSrc.fiber);
      addNumber('sugar', nSrc.sugar_g, nSrc.sugar_grams, nSrc.sugar);
      return nutrition;
    };

    const hasNutritionData = (n) => {
      if (!n || typeof n !== 'object') return false;
      return ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'].some((k) => Number(n[k]) > 0);
    };

    return shuffled.map(r => {
      const esNutrition = buildNutrition(r);
      const llmNutrition = r.nutrition;
      const nutrition = hasNutritionData(esNutrition)
        ? esNutrition
        : (hasNutritionData(llmNutrition) ? llmNutrition : esNutrition);
      if (LOG_MEALPLAN && r.id && String(r.id).startsWith('llm-')) {
        logMealplan('🧠 LLM candidate used', {
          id: r.id,
          title: r.title,
          meal_type: r.meal_type,
          calories: nutrition.calories,
          protein: nutrition.protein
        });
      }
      return {
        id: r.id || r._id,
        title: r.title,
        cuisine: r.cuisine,
        meal_type: r.meal_type,
        diet_tags: r.dietary_tags || r.diet_tags || [],
        total_time_min: r.total_time_min || r.total_time_minutes || null,
        calories: nutrition.calories ?? r.calories ?? null,
        protein: nutrition.protein ?? null,
        carbs: nutrition.carbs ?? null,
        fat: nutrition.fat ?? null,
        fiber: nutrition.fiber ?? null,
        sugar: nutrition.sugar ?? null,
        nutrition: Object.keys(nutrition).length ? nutrition : null,
        url: r.url,
        ingredients: r.ingredients_norm || r.ingredients_raw || [],
        ingredients_parsed: r.ingredients_parsed || [],
        instructions: r.instructions || []
      };
    });
  }

  formatCandidatesForPrompt(candidateMap) {
    const sections = Object.entries(candidateMap).map(([mealType, list]) => {
      // Guard against oversized lists; keep prompt short and lightly shuffle to avoid same ordering
      const limited = Array.isArray(list) ? this.shuffle(list).slice(0, 20) : [];
      const lines = limited.map(c => {
        const time = c.total_time_min ? `, time ~${c.total_time_min} min` : '';
        const cals = c.calories ? `, cal ~${c.calories}` : '';
        return `- ${c.title} (id: ${c.id}, cuisine: ${c.cuisine || 'n/a'}${time}${cals})`;
      }).join('\n');
      return `${mealType.toUpperCase()} candidates:\n${lines || '- none found'}`;
    });
    return sections.join('\n\n');
  }

  /**
   * Ask Gemini to propose ES filters given a meal type and preferences.
   * Returns null on failure to avoid blocking.
   */
  async buildEsFiltersWithGemini(mealType, preferences) {
    // Use Ollama or Gemini to synthesize filters; return null on failure.
    const prompt = `
    You build Elasticsearch filters for recipes. Given a meal type and user preferences, return ONLY JSON (no markdown, no backticks) with these keys:
    {
      "meal_type": "<meal type>",
      "diet_tags": [strings],
      "include_ingredients": [strings],
      "exclude_ingredients": [strings],
      "cuisine": "<string or null>",
      "max_total_time_min": number or null,
      "calories_range": { "gte": number, "lte": number } or null,
      "protein_g_range": { "gte": number, "lte": number } or null,
      "goal_fit": "<weight_loss|weight_maintenance|weight_gain|null>",
      "activity_fit": "<low_activity|moderate_activity|high_activity|null>"
    }
    - Keep arrays short (<=6 items). Use lowercase for tags/ingredients.
    - If you are unsure, set fields to null or empty arrays.
    Meal type: ${mealType}
    Preferences: ${JSON.stringify(preferences, null, 2)}
    `;
    
    const parseJsonLoose = (raw) => {
      if (!raw) return null;
      const fence = raw.match(/```json\s*([\s\S]*?)```/i);
      const cleaned = fence ? fence[1] : raw.replace(/```/g, '');
      try {
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    };

    try {
      const text = await this.callTextModel(prompt, 0); // temperature 0 for deterministic filters
      const parsed = parseJsonLoose(text);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.meal_type) parsed.meal_type = mealType;
      if (!parsed.goal_fit && preferences?.goals) {
        parsed.goal_fit = String(preferences.goals).toLowerCase();
      }
      if (!parsed.activity_fit && preferences?.activityLevel) {
        parsed.activity_fit = String(preferences.activityLevel).toLowerCase();
      }
      return parsed;
    } catch (err) {
      console.warn('⚠️ LLM filter synthesis failed, using deterministic filters. Error:', err.message);
      return null;
    }
  }

  /**
   * Call either Gemini or local Ollama (if USE_OLLAMA_FOR_MEALPLAN=true) with configurable temperature.
   */
  async callTextModel(prompt, temperature = 0.6) {
    if (this.provider === 'gemini') {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: { temperature }
      });
      const response = await result.response;
      return response.text();
    }

    if (this.provider === 'groq') {
      const { content } = await groqChat({
        model: this.groqModel,
        temperature,
        maxTokens: 4096,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a helpful assistant that only returns the requested JSON or text. Do not add Markdown fences.' },
          { role: 'user', content: prompt }
        ]
      });
      return content;
    }

    // Ollama path
    const res = await fetch(`${this.ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        stream: false,
        options: { temperature }
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama error ${res.status}: ${body}`);
    }
    const data = await res.json();
    return data?.response || '';
  }

  /**
   * Normalize a list of ingredient strings/objects into [{name, amount, unit, category}]
   * using the active text model. Falls back to original input on failure.
   */
  async normalizeIngredientsWithModel(rawIngredients = []) {
    try {
      const prompt = `
      Normalize this ingredient list into JSON array of objects:
      [
        { "name": "<string>", "amount": "<string>", "unit": "<string>", "category": "protein|vegetable|fruit|grain|dairy|fat|spice|nut|seed|other" }
      ]
      Return ONLY JSON (no markdown). If amount/unit are missing, infer reasonable defaults.
      Input ingredients:
      ${JSON.stringify(rawIngredients, null, 2)}
      `;
      const text = await this.callTextModel(prompt, 0.2);
      const fence = text.match(/```json\s*([\s\S]*?)```/i);
      const cleaned = fence ? fence[1] : text.replace(/```/g, '');
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : rawIngredients;
    } catch (err) {
      console.warn('⚠️ Ingredient normalization failed, using original list:', err.message);
      return rawIngredients;
    }
  }

  async generateMealPlan(userPreferences, duration = 7, user = null) {
    const randomSeed = Math.floor(Math.random() * 1_000_000_000);

    const ingredientBlueprint = this.buildIngredientBlueprint({
      preferences: userPreferences,
      duration,
      randomSeed
    });

    const fallbackPlan = this.buildFallbackMealPlan({
      blueprint: ingredientBlueprint,
      preferences: userPreferences,
      duration,
      randomSeed
    });

    try {
      // Generate one day at a time for better reliability
      const days = [];
      const startDate = new Date();
      const recentIds = []; // track recent recipe ids to avoid back-to-back repeats
      const usedRecipeIds = new Set(); // track all recipes used in the plan to avoid repeats

      // Build candidate pools once per meal type, then reuse across days to reduce repeats
      const padWithLLM = async (mealType, list, targetSize = 6) => {
        const output = [...(list || [])];
        while (output.length < targetSize) {
          const remaining = targetSize - output.length;
          const llmRecipes = await this.generateLLMFallbackRecipes(mealType, userPreferences, Math.min(remaining, 8));
          if (!llmRecipes.length) break;
          output.push(...llmRecipes);
        }
        return output;
      };
      const baseCandidateMap = {
        breakfast: await padWithLLM('breakfast', await this.fetchCandidatesForMeal('breakfast', userPreferences, 24), 20),
        lunch: await padWithLLM('lunch', await this.fetchCandidatesForMeal('lunch', userPreferences, 28), 24),
        dinner: await padWithLLM('dinner', await this.fetchCandidatesForMeal('dinner', userPreferences, 28), 24),
        snack: await padWithLLM('snack', await this.fetchCandidatesForMeal('snack', userPreferences, 14), 12)
      };

      for (let dayIndex = 0; dayIndex < duration; dayIndex++) {
        const dayBlueprint = ingredientBlueprint[dayIndex]; // Blueprint is an array, not object with .days
        
        if (!dayBlueprint) {
          console.error(`❌ No blueprint found for day ${dayIndex}, using fallback`);
          days.push(fallbackPlan.days[dayIndex]);
          continue;
        }
        
        logMealplan(`📅 Generating day ${dayIndex + 1}/${duration} (${dayBlueprint.cuisine || 'any'} cuisine)`);
        
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + dayIndex);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Reuse pre-fetched candidates; filter out recently used and shuffle to avoid repeats
        const filterUsed = (list = []) => {
          const filtered = list.filter((r) => r?.id && !usedRecipeIds.has(String(r.id)));
          return filtered.length ? filtered : list;
        };
        const candidateMap = {
          breakfast: this.shuffle(filterUsed(baseCandidateMap.breakfast)),
          lunch: this.shuffle(filterUsed(baseCandidateMap.lunch)),
          dinner: this.shuffle(filterUsed(baseCandidateMap.dinner)),
          snack: this.shuffle(filterUsed(baseCandidateMap.snack))
        };
        logMealplan(`🎲 Shuffled candidates for day ${dayIndex + 1}`, {
          breakfast: candidateMap.breakfast.slice(0, 5).map((c) => ({ id: c.id, title: c.title })),
          lunch: candidateMap.lunch.slice(0, 5).map((c) => ({ id: c.id, title: c.title })),
          dinner: candidateMap.dinner.slice(0, 5).map((c) => ({ id: c.id, title: c.title })),
          snack: candidateMap.snack.slice(0, 5).map((c) => ({ id: c.id, title: c.title }))
        });
        const counts = Object.fromEntries(Object.entries(candidateMap).map(([k, v]) => [k, v?.length || 0]));
        logMealplan(`🔍 Candidate counts for day ${dayIndex + 1}`, counts);
        logEvent({
          level: 'info',
          message: 'mealPlan:candidates',
          meta: {
            day: dayIndex + 1,
            counts,
            candidates: {
              breakfast: (candidateMap.breakfast || []).map((c) => ({ id: c.id, title: c.title })),
              lunch: (candidateMap.lunch || []).map((c) => ({ id: c.id, title: c.title })),
              dinner: (candidateMap.dinner || []).map((c) => ({ id: c.id, title: c.title })),
              snack: (candidateMap.snack || []).map((c) => ({ id: c.id, title: c.title }))
            }
          },
          user
        }).catch(() => {});
        Object.entries(candidateMap).forEach(([mealType, list]) => {
          const sample = (list || []).slice(0, 3).map(r => `${r.title || 'untitled'} (${r.id})`);
          logMealplan(`  • ${mealType}: ${sample.join(' | ') || 'none'}`);
        });
        const candidateText = this.formatCandidatesForPrompt(candidateMap);
        const dayPrompt = `
        Create ONE DAY of meals for date ${dateStr}.

        Diet: ${userPreferences.dietType}
        Goals: ${userPreferences.goals}
        Allergies: ${userPreferences.allergies?.join(', ') || 'None'}
        Disliked Foods: ${userPreferences.dislikedFoods?.join(', ') || 'None'}
        
        Cuisine for this day: ${dayBlueprint.cuisine || 'any'}

        Meal Times:
        - Breakfast: ${userPreferences.mealTimes?.breakfast || '08:00'}
        - Lunch: ${userPreferences.mealTimes?.lunch || '13:00'}
        - Dinner: ${userPreferences.mealTimes?.dinner || '19:00'}

        Use these ingredients as inspiration:
        ${JSON.stringify(dayBlueprint, null, 2)}

        Here are EXISTING recipes you must prefer and pick from (by id and title).
        You MUST select only from these; do not invent ids or titles. If none fits, pick the closest candidate instead of leaving empty.
        ${candidateText}

        IMPORTANT:
        - Each meal must select exactly one recipe id from the candidates listed for that meal type; do NOT pull from another meal type and do NOT invent ids.
        - Choose candidates that make sense for the meal type (e.g., breakfast should be breakfast foods, not dinner entrées or cleaning products); skip off-theme items and pick the next best food item from the same meal type list.
        - Write ALL text (recipe names, descriptions, instructions) in ENGLISH.
        - Prefer the listed existing recipes by id/title; do not invent ids.
        - Return ONLY strict JSON. Do NOT include ellipses, comments, or markdown fences.

        JSON schema to return (fill every field with concrete values):
        {
          "date": "${dateStr}",
          "meals": [
            {
              "type": "breakfast",
              "scheduledTime": "${userPreferences.mealTimes?.breakfast || '08:00'}",
              "recipes": [
                {
                  "id": "existing-recipe-id-or-null",
                  "name": "Recipe Name",
                  "description": "Brief description",
                  "prepTime": 10,
                  "cookTime": 15,
                  "servings": 1,
                  "ingredients": [
                    {"name": "Ingredient", "amount": "1", "unit": "cup", "category": "grain"}
                  ],
                  "instructions": ["Step 1", "Step 2"],
                  "nutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8, "fiber": 5, "sugar": 10},
                  "tags": ["${dayBlueprint.cuisine}"],
                  "difficulty": "easy"
                }
              ],
              "totalNutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8}
            },
            {
              "type": "lunch",
              "scheduledTime": "${userPreferences.mealTimes?.lunch || '13:00'}",
              "recipes": [
                {
                  "id": "existing-recipe-id-or-null",
                  "name": "Recipe Name",
                  "description": "Brief description",
                  "prepTime": 10,
                  "cookTime": 15,
                  "servings": 1,
                  "ingredients": [
                    {"name": "Ingredient", "amount": "1", "unit": "cup", "category": "grain"}
                  ],
                  "instructions": ["Step 1", "Step 2"],
                  "nutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8, "fiber": 5, "sugar": 10},
                  "tags": ["${dayBlueprint.cuisine}"],
                  "difficulty": "easy"
                }
              ],
              "totalNutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8}
            },
            {
              "type": "dinner",
              "scheduledTime": "${userPreferences.mealTimes?.dinner || '19:00'}",
              "recipes": [
                {
                  "id": "existing-recipe-id-or-null",
                  "name": "Recipe Name",
                  "description": "Brief description",
                  "prepTime": 10,
                  "cookTime": 15,
                  "servings": 1,
                  "ingredients": [
                    {"name": "Ingredient", "amount": "1", "unit": "cup", "category": "grain"}
                  ],
                  "instructions": ["Step 1", "Step 2"],
                  "nutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8, "fiber": 5, "sugar": 10},
                  "tags": ["${dayBlueprint.cuisine}"],
                  "difficulty": "easy"
                }
              ],
              "totalNutrition": {"calories": 300, "protein": 10, "carbs": 40, "fat": 8}
            },
            {
              "type": "snack",
              "scheduledTime": "15:00",
              "recipes": [
                {
                  "id": "existing-recipe-id-or-null",
                  "name": "Recipe Name",
                  "description": "Brief description",
                  "prepTime": 5,
                  "cookTime": 0,
                  "servings": 1,
                  "ingredients": [
                    {"name": "Ingredient", "amount": "1", "unit": "cup", "category": "fruit"}
                  ],
                  "instructions": ["Step 1", "Step 2"],
                  "nutrition": {"calories": 150, "protein": 5, "carbs": 20, "fat": 5, "fiber": 3, "sugar": 10},
                  "tags": ["${dayBlueprint.cuisine}"],
                  "difficulty": "easy"
                }
              ],
              "totalNutrition": {"calories": 150, "protein": 5, "carbs": 20, "fat": 5}
            }
          ]
        }
        `;

        try {
          const tLLMStart = Date.now();
          logMealplan(`🧠 Calling LLM for day ${dayIndex + 1}/${duration}...`);
          const text = await this.callTextModel(dayPrompt, 0.8);
          logMealplan(`🧠 LLM response for day ${dayIndex + 1} in ${Date.now() - tLLMStart} ms (length ${text?.length || 0})`);

          // Parse the day's JSON with a few tolerant repairs (handles trailing commas)
          const tryParse = (raw) => {
            if (!raw) return null;
            // strip markdown fences if present
            const fence = raw.match(/```json\s*([\s\S]*?)\s*```/);
            const body = fence ? fence[1] : raw;
            const cleaned = body
              // remove single-line // comments
              .replace(/\/\/.*$/gm, '')
              // remove /* */ comments
              .replace(/\/\*[\s\S]*?\*\//g, '')
              // remove trailing commas before ] or }
              .replace(/,\s*]/g, ']')
              .replace(/,\s*}/g, '}');
            try {
              return JSON.parse(cleaned);
            } catch {
              return null;
            }
          };

          let dayData = tryParse(text);
          if (!dayData) {
            // Try to extract JSON object if parsing whole text failed
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              dayData = tryParse(jsonMatch[0]);
            }
          }
          
          if (dayData && dayData.meals) {
            // Post-process to force recipes to come from candidateMap when available
            await this.enforceCandidateRecipes(dayData, candidateMap);
            // Keep only one recipe per meal to avoid duplicates in UI
            dayData.meals = (dayData.meals || []).map((meal) => {
              const recipes = Array.isArray(meal.recipes) ? meal.recipes : [];
              const first = recipes[0] ? [recipes[0]] : [];
              return { ...meal, recipes: first };
            });
            this.dedupeDayRecipes(dayData, recentIds, usedRecipeIds);
            // Sanity check with LLM after dedupe to catch off-theme meals and propose replacements
            await this.sanityCheckDayPlan(dayData, candidateMap);
            // Track ids for next day dedupe (keep last day’s ids)
            const idsToday = this.collectRecipeIds(dayData);
            recentIds.splice(0, recentIds.length, ...idsToday);
            idsToday.forEach((id) => usedRecipeIds.add(String(id)));
            days.push(dayData);
          } else {
            console.warn(`⚠️ Day ${dayIndex + 1} failed, using fallback`);
            days.push(fallbackPlan.days[dayIndex]);
          }
        } catch (dayError) {
          console.error(`❌ Error generating day ${dayIndex + 1}:`, dayError.message);
          days.push(fallbackPlan.days[dayIndex]);
        }
      }

      // Generation complete
      logMealplan(`✅ Meal plan generation complete: ${days.length} days`);
      return {
        title: `${duration}-Day ${userPreferences.dietType || 'Balanced'} Meal Plan`,
        description: `A ${duration}-day meal plan tailored to your preferences`,
        days
      };
    } catch (error) {
      console.error('Error generating meal plan:', error);
      console.warn('⚠️ Falling back to deterministic meal plan due to error:', error.message);
      return fallbackPlan;
    }
  }

  /**
   * Ensure LLM-picked recipes align with ES candidates:
   * - If id matches a candidate, force name/ingredients/instructions from candidate (ground truth).
   * - If id is missing or not in candidates, replace with the first candidate for that meal type.
   */
  async enforceCandidateRecipes(dayData, candidateMap) {
    if (!dayData?.meals || !candidateMap) return;

    const dayUsedIds = new Set();
    const hasIngredientsData = (src = {}) => {
      return (
        (Array.isArray(src.ingredients_parsed) && src.ingredients_parsed.length) ||
        (typeof src.ingredients_raw === 'string' && src.ingredients_raw.trim()) ||
        (Array.isArray(src.ingredients_norm) && src.ingredients_norm.length) ||
        (Array.isArray(src.ingredients) && src.ingredients.length)
      );
    };

    const candidatesByMeal = {};
    for (const [mealType, list] of Object.entries(candidateMap)) {
      const map = new Map();
      const hydrated = [];
      for (const c of list || []) {
        if (c?.id && !hasIngredientsData(c)) {
          try {
            const fetched = await getRecipeById(c.id);
            if (fetched) {
              logMealplan(`📦 Hydrated candidate ${c.id} for ${mealType} with ingredients from ES`);
              const merged = { ...c, ...fetched };
              hydrated.push(merged);
              map.set(String(c.id), merged);
              continue;
            }
          } catch (err) {
            console.warn(`⚠️ Failed to hydrate candidate ${c?.id}: ${err.message}`);
          }
        }
        if (c?.id) map.set(String(c.id), c);
        hydrated.push(c);
      }
      candidatesByMeal[mealType] = { list: hydrated, map };
    }

    logMealplan('🧭 enforceCandidateRecipes start', {
      meals: dayData.meals.length,
      candidateTypes: Object.keys(candidateMap)
    });

    dayData.meals = dayData.meals.map((meal) => {
      const mealType = (meal?.type || '').toLowerCase();
      const bucket = candidatesByMeal[mealType];
      if (!bucket || !bucket.list?.length) {
        // No candidates for this meal type: drop non-grounded recipes
        logMealplan(`⚠️ No candidates for meal type "${mealType}", clearing recipes`);
        return { ...meal, recipes: [] };
      }

      const fixRecipe = (r) => {
        if (r && bucket.map.has(String(r.id))) {
          const src = bucket.map.get(String(r.id));
          // Always use parsed ingredients_raw to stay grounded
          let ingredients = this.parseIngredientsFromSource(src);
          if (!ingredients.length && Array.isArray(r.ingredients)) {
            ingredients = r.ingredients;
          }
          const extracted = this.extractNutritionFromSource(src);
          const nutrition = this.hasNutritionData(extracted)
            ? extracted
            : (this.hasNutritionData(r.nutrition) ? r.nutrition : extracted);
          if (src?.id) dayUsedIds.add(String(src.id));
          return {
            ...r,
            id: src.id,
            name: src.title || r.name,
            description: src.description || r.description,
            ingredients,
            instructions: src.instructions || r?.instructions || [],
            nutrition
          };
        }
        // Always pick a candidate if none/mismatch
        const first = this.shuffle(bucket.list).find((c) => c?.id && !dayUsedIds.has(String(c.id))) || this.shuffle(bucket.list)[0];
        let ingredients = this.parseIngredientsFromSource(first);
        if (!ingredients.length && Array.isArray(r?.ingredients)) {
          ingredients = r.ingredients;
        }
        const extracted = this.extractNutritionFromSource(first);
        const nutrition = this.hasNutritionData(extracted)
          ? extracted
          : (this.hasNutritionData(r?.nutrition) ? r?.nutrition : extracted);
        logMealplan('🔄 fixRecipe: replacing with random candidate', {
          mealType,
          chosenId: first?.id || null,
          candidateTitles: this.shuffle(bucket.list).slice(0, 3).map((c) => c.title),
          nutrition
        });
        const base = {
          id: first?.id || null,
          name: first?.title || r?.name || 'Recipe',
          description: first?.title || r?.description || '',
          tags: r?.tags || [first?.cuisine].filter(Boolean),
          ingredients,
          instructions: first?.instructions || r?.instructions || [],
          nutrition
        };
        if (first?.id) dayUsedIds.add(String(first.id));
        return { ...r, ...base };
      };

      const recipes = Array.isArray(meal?.recipes) && meal.recipes.length
        ? meal.recipes.map(fixRecipe)
        : [fixRecipe(null)];

      const totalNutrition = this.sumRecipeNutrition(recipes);

      return { ...meal, recipes, totalNutrition };
    });

    const recipeCount = dayData.meals.reduce((acc, m) => acc + (m.recipes?.length || 0), 0);
    logMealplan(`✅ enforceCandidateRecipes done. Meals=${dayData.meals.length}, recipes=${recipeCount}`);
  }

  /**
   * Remove duplicate recipes within the same day and avoid repeats from the previous day.
   */
  dedupeDayRecipes(dayData, recentIds = [], usedSet = new Set()) {
    if (!dayData?.meals) return;
    const daySeen = new Set();
    const recentSet = new Set(recentIds || []);

    dayData.meals = dayData.meals.map((meal) => {
      const recipes = Array.isArray(meal?.recipes) ? meal.recipes : [];
      const filtered = [];
      recipes.forEach((r) => {
        const rid = r?.id;
        if (!rid) return;
        if (daySeen.has(rid)) return;
        if (recentSet.has(rid)) return;
        if (usedSet.has(String(rid))) return;
        daySeen.add(rid);
        filtered.push(r);
      });
      return { ...meal, recipes: filtered.length ? filtered : recipes };
    });
  }

  collectRecipeIds(dayData) {
    const ids = [];
    if (!dayData?.meals) return ids;
    dayData.meals.forEach((meal) => {
      (meal.recipes || []).forEach((r) => {
        if (r?.id) ids.push(String(r.id));
      });
    });
    return ids;
  }

  shuffle(arr) {
    const copy = [...(arr || [])];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Generate a single recipe via LLM when ES returns no candidates.
   */
  async generateLLMFallbackRecipe(mealType, preferences = {}) {
    try {
      const prompt = `
      Return ONLY JSON (no markdown) for ONE recipe matching:
      meal_type: ${mealType}
      cuisine preference: ${preferences.cuisine || preferences.preferredCuisine || 'any'}
      diet: ${preferences.dietType || 'any'}
      allergies/dislikes: ${(preferences.allergies || []).join(', ')}; ${(preferences.dislikedFoods || []).join(', ')}
      The JSON shape:
      {
        "id": "string",
        "title": "string",
        "cuisine": "string",
        "meal_type": ["${mealType}"],
        "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number },
        "ingredients_parsed": [ { "name": "string", "amount": "string", "unit": "string", "category": "protein|vegetable|fruit|grain|dairy|fat|spice|nut|seed|other" } ],
        "instructions": ["Step 1", "Step 2"]
      }
      Use reasonable macro values (>0). Keep ingredients_parsed to 8-14 items.
      `;
      const raw = await this.callTextModel(prompt, 0.4);
      const cleaned = raw.replace(/```json|```/gi, '');
      const recipe = JSON.parse(cleaned);
      if (!recipe) return null;
      recipe.id = recipe.id || `llm-${Date.now()}`;
      recipe.meal_type = Array.isArray(recipe.meal_type) ? recipe.meal_type : [mealType];
      return recipe;
    } catch (err) {
      logMealplan('⚠️ LLM fallback recipe failed:', err.message);
      return null;
    }
  }

  async generateLLMFallbackRecipes(mealType, preferences = {}, count = 3) {
    try {
      const prompt = `
      Return ONLY JSON (no markdown) for an array of ${count} recipes matching:
      meal_type: ${mealType}
      cuisine preference: ${preferences.cuisine || preferences.preferredCuisine || 'any'}
      diet: ${preferences.dietType || 'any'}
      allergies/dislikes: ${(preferences.allergies || []).join(', ')}; ${(preferences.dislikedFoods || []).join(', ')}
      Ensure the meal makes sense for ${mealType} (e.g., breakfast = breakfast foods, lunch/dinner = savory mains, snack = light snack), avoid cleaning products or non-food items.
      The JSON shape:
      [
        {
          "id": "string",
          "title": "string",
          "cuisine": "string",
          "meal_type": ["${mealType}"],
          "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number },
          "ingredients_parsed": [ { "name": "string", "amount": "string", "unit": "string", "category": "protein|vegetable|fruit|grain|dairy|fat|spice|nut|seed|other" } ],
          "instructions": ["Step 1", "Step 2"]
        }
      ]
      Use reasonable macro values (>0). Keep ingredients_parsed to 8-14 items.
      `;
      const raw = await this.callTextModel(prompt, 0.4);
      const parseLooseArray = (text) => {
        if (!text) return null;
        let body = text.replace(/```json|```/gi, '').trim();
        const arrayMatch = body.match(/\[[\s\S]*\]/);
        if (arrayMatch) body = arrayMatch[0];
        try {
          const parsed = JSON.parse(body);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && typeof parsed === 'object') return [parsed];
        } catch {
          return null;
        }
        return null;
      };
      const arr = parseLooseArray(raw);
      if (!Array.isArray(arr)) {
        logMealplan('⚠️ LLM batch returned non-array', { mealType, preview: raw?.slice(0, 200) });
        return [];
      }
      const calorieFloors = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
      const mealCalFloor = calorieFloors[mealType] || 0;
      const mapped = arr
        .map((r) => ({
          ...r,
          id: r.id || `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          meal_type: Array.isArray(r.meal_type) ? r.meal_type : [mealType]
        }))
        .filter((r) => {
          const cal = Number(r?.nutrition?.calories ?? r?.calories ?? 0);
          const protein = Number(r?.nutrition?.protein ?? r?.protein ?? 0);
          return cal >= mealCalFloor && protein > 0;
        });
      return mapped;
    } catch (err) {
      logMealplan('⚠️ LLM batch fallback recipes failed:', err.message);
      return [];
    }
  }

  /**
   * Build a simple ingredient list from the ES source: prefer structured ingredients,
   * otherwise split ingredients_raw into separate items.
   */
  parseIngredientsFromSource(src = {}) {
    // Prefer fully parsed ingredients from ES; fallback to ingredients_raw, ingredients_norm, then structured ingredients
    if (Array.isArray(src.ingredients_parsed) && src.ingredients_parsed.length) {
      return src.ingredients_parsed.map((ing) => ({
        name: ing.name || '',
        amount: ing.amount || '1',
        unit: ing.unit || 'unit',
        category: (ing.category || 'other').toLowerCase()
      }));
    }

    // Legacy fallbacks
    if (typeof src.ingredients_raw === 'string' && src.ingredients_raw.trim().length) {
      return src.ingredients_raw
        .split(',')
        .map((s) => this.parseRawIngredient(s))
        .filter(Boolean);
    }
    if (Array.isArray(src.ingredients_norm) && src.ingredients_norm.length) {
      return src.ingredients_norm
        .map((name) => (name ? { name: String(name).trim() } : null))
        .filter(Boolean);
    }
    if (Array.isArray(src.ingredients) && src.ingredients.length) {
      return src.ingredients;
    }
    return [];
  }

  /**
   * Parse a single raw ingredient string into { name, amount, unit } when possible.
   */
  parseRawIngredient(raw = '') {
    const str = String(raw).trim();
    if (!str) return null;

    // Normalize whitespace
    const cleaned = str.replace(/\s+/g, ' ').trim();
    const tokens = cleaned.split(' ');

    const isNumberish = (t) => /^(\d+(\.\d+)?|\d+\/\d+)$/.test(t);
    const knownUnits = new Set([
      'tsp', 'tsp.', 'teaspoon', 'teaspoons',
      'tbsp', 'tbsp.', 'tablespoon', 'tablespoons',
      'cup', 'cups', 'c', 'c.',
      'oz', 'oz.', 'ounce', 'ounces',
      'lb', 'lb.', 'pound', 'pounds',
      'g', 'gram', 'grams',
      'kg', 'ml', 'stick', 'sticks',
      'clove', 'cloves', 'slice', 'slices',
      'can', 'cans'
    ]);

    let amount = null;
    let unit = '';
    let idx = 0;

    // handle amounts like "2", "1/2", "2 1/2", "3/4"
    if (tokens[idx] && isNumberish(tokens[idx])) {
      amount = tokens[idx];
      idx += 1;
      if (tokens[idx] && isNumberish(tokens[idx])) {
        amount = `${amount} ${tokens[idx]}`;
        idx += 1;
      }
    }

    if (tokens[idx]) {
      const u = tokens[idx].replace(/\.$/, '').toLowerCase();
      if (knownUnits.has(u)) {
        unit = tokens[idx];
        idx += 1;
      }
    }

    const name = tokens.slice(idx).join(' ').trim();
    return {
      name: name || str,
      amount: amount || '1',
      unit: unit || 'unit'
    };
  }

  hasNutritionData(n) {
    if (!n || typeof n !== 'object') return false;
    const required = ['calories', 'protein', 'carbs', 'fat'];
    return required.every((k) => Number(n[k]) > 0);
  }

  /**
   * Ask LLM to sanity-check a day's meals and suggest replacements by candidate id.
   */
  async sanityCheckDayPlan(dayData, candidateMap) {
    try {
      if (!dayData?.meals?.length) return;
    const summary = dayData.meals.map((m) => {
      const r = m.recipes?.[0] || {};
      return {
        type: m.type,
        id: r.id || r.externalId || null,
        title: r.name || r.title,
        calories: r.nutrition?.calories || r.calories,
        protein: r.nutrition?.protein || r.protein
      };
    });
      const candidatesByType = Object.fromEntries(
        Object.entries(candidateMap || {}).map(([k, v]) => [
          k,
          (v || []).map((c) => ({ id: c.id, title: c.title, calories: c.calories || c.nutrition?.calories || 0 }))
        ])
      );
      const prompt = `
      Evaluate this meal day for sanity. Rules:
      - Avoid off-theme items (e.g., desserts for dinner, cleaning products, obviously non-food).
      - Avoid repeated proteins for breakfast (prefer traditional breakfast foods); keep lunch/dinner savory mains.
      - Prefer meals with protein > 0 and sensible calories (skip obvious near-zero calorie meals).
      - Keep meal type coherent: breakfast should be breakfast-like; dinner should not be sweets-only.
      - If a meal looks off-theme, propose a replacement id from the SAME meal type candidates.
      Return ONLY JSON: {"replacements":[{"type":"breakfast","replaceWithId":"candidate-id-or-null"}, ...]}
      Meals: ${JSON.stringify(summary)}
      Candidates: ${JSON.stringify(candidatesByType)}
      `;
      const raw = await this.callTextModel(prompt, 0.3);
      const cleaned = raw.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed?.replacements) return;
      const replMap = {};
      parsed.replacements.forEach((r) => {
        if (r?.type && r.replaceWithId) replMap[r.type.toLowerCase()] = r.replaceWithId;
      });
      dayData.meals = dayData.meals.map((meal) => {
        const desiredId = replMap[meal.type];
        if (!desiredId) return meal;
        const bucket = candidateMap?.[meal.type] || [];
        const found = bucket.find((c) => String(c.id) === String(desiredId));
        if (!found) return meal;
        const mapped = {
          id: found.id,
          name: found.title,
          description: found.description || '',
          ingredients: found.ingredients_parsed || found.ingredients_norm || [],
          instructions: Array.isArray(found.instructions)
            ? found.instructions
            : typeof found.instructions === 'string'
              ? found.instructions.split(/\r?\n/).filter(Boolean)
              : [],
          nutrition: found.nutrition || {}
        };
        return { ...meal, recipes: [mapped], totalNutrition: this.sumRecipeNutrition([mapped]) };
      });
      logMealplan('✅ sanityCheckDayPlan replacements applied', {
        replacements: parsed?.replacements || [],
        meals: dayData.meals.map((m) => ({
          type: m.type,
          id: m.recipes?.[0]?.id,
          title: m.recipes?.[0]?.name || m.recipes?.[0]?.title
        }))
      });
    } catch (err) {
      logMealplan('⚠️ sanityCheckDayPlan failed', err.message);
    }
  }

  extractNutritionFromSource(src = {}) {
    const nutrition = {};
    const parseNumeric = (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'string') {
        const match = val.match(/-?\\d+(?:\\.\\d+)?/);
        if (match) {
          const num = Number(match[0]);
          if (Number.isFinite(num)) return num;
        }
      }
      return null;
    };
    const addNumber = (key, ...candidates) => {
      for (const val of candidates) {
        const num = parseNumeric(val);
        if (num !== null) {
          nutrition[key] = num;
          return;
        }
      }
    };
    const nSrc = src.nutrition || {};
    addNumber('calories', src.calories, nSrc.calories);
    addNumber('protein', src.protein_grams, src.protein_g, src.protein, nSrc.protein_g, nSrc.protein);
    addNumber('carbs', src.carbs_grams, src.carbs_g, src.carbs, nSrc.carbs_g, nSrc.carbs);
    addNumber('fat', src.fat_grams, src.fat_g, src.fat, nSrc.fat_g, nSrc.fat);
    addNumber('fiber', src.fiber_grams, src.fiber_g, src.fiber, nSrc.fiber_g, nSrc.fiber);
    addNumber('sugar', src.sugar_grams, src.sugar_g, src.sugar, nSrc.sugar_g, nSrc.sugar);
    return nutrition;
  }

  sumRecipeNutrition(recipes = []) {
    const total = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
    recipes.forEach((r) => {
      const n = r?.nutrition || {};
      total.calories += Number(n.calories) || 0;
      total.protein += Number(n.protein) || 0;
      total.carbs += Number(n.carbs) || 0;
      total.fat += Number(n.fat) || 0;
      total.fiber += Number(n.fiber) || 0;
      total.sugar += Number(n.sugar) || 0;
    });
    return total;
  }

  async chatWithDietitian(message, conversationHistory = [], activeMealPlan = null, user = null) {
    try {
      // Build meal plan context if available
      let mealPlanContext = '';
      if (activeMealPlan && activeMealPlan.days && activeMealPlan.days.length > 0) {
        mealPlanContext = `\n\n**USER'S ACTIVE MEAL PLAN CONTEXT:**
        
        Title: ${activeMealPlan.title}
        Description: ${activeMealPlan.description || 'No description'}
        Duration: ${activeMealPlan.days.length} days
        Status: ${activeMealPlan.status}
        Start Date: ${activeMealPlan.startDate ? new Date(activeMealPlan.startDate).toLocaleDateString() : 'N/A'}
        End Date: ${activeMealPlan.endDate ? new Date(activeMealPlan.endDate).toLocaleDateString() : 'N/A'}
        
        **DAILY MEALS OVERVIEW:**
        ${activeMealPlan.days.map((day, idx) => {
          const dayDate = day.date ? new Date(day.date).toLocaleDateString() : `Day ${idx + 1}`;
          const meals = day.meals.map(meal => {
            const recipeNames = meal.recipes.map(r => r.name).join(', ');
            return `  • ${meal.type.charAt(0).toUpperCase() + meal.type.slice(1)} (${meal.scheduledTime}): ${recipeNames}`;
          }).join('\n');
          return `Day ${idx + 1} (${dayDate}):\n${meals}`;
        }).join('\n\n')}
        
        Use this meal plan context to provide personalized advice. Reference specific meals, recipes, or days when relevant to the user's question.`;
      } else {
        // no meal plan context
      }

      // Build user profile context if available
      let userContext = '';
      if (user && user.preferences) {
        userContext = `\n\n**USER PROFILE:**
        
        Diet Type: ${user.preferences.dietType || 'Not specified'}
        Allergies: ${user.preferences.allergies && user.preferences.allergies.length > 0 ? user.preferences.allergies.join(', ') : 'None'}
        Disliked Foods: ${user.preferences.dislikedFoods && user.preferences.dislikedFoods.length > 0 ? user.preferences.dislikedFoods.join(', ') : 'None'}
        ${user.profile ? `
        Activity Level: ${user.profile.activityLevel || 'Not specified'}
        Goals: ${user.profile.goals || 'Not specified'}
        Age: ${user.profile.age || 'Not specified'}
        Weight: ${user.profile.weight ? `${user.profile.weight} kg` : 'Not specified'}
        Height: ${user.profile.height ? `${user.profile.height} cm` : 'Not specified'}` : ''}
        
        Take into account this user profile when providing advice.`;
      }

      const systemPrompt = `
        You are a professional nutritionist and dietitian with expertise in:
        - Personalized nutrition planning
        - Dietary restrictions and allergies
        - Weight management
        - Sports nutrition
        - Medical nutrition therapy
        - Meal planning and cooking
        
        Provide helpful, accurate, and personalized advice. Always recommend consulting with a healthcare professional for medical conditions.
        Keep responses concise but informative.
        ${mealPlanContext}${userContext}
        
        **IMPORTANT FORMATTING GUIDELINES:**
        - Use line breaks to separate different topics or sections
        - Use bullet points (- or •) for lists of items, tips, or recommendations
        - Use numbered lists (1., 2., 3.) for step-by-step instructions
        - Use **bold text** for important points or headings
        - Use *italic text* for emphasis
        - Use \`code formatting\` for specific measurements or technical terms
        - Use > blockquotes for important notes or warnings
        - Always format your response for easy reading with proper spacing
      `;

      const fullPrompt = `${systemPrompt}\n\nConversation History:\n${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\nUser: ${message}\n\nAssistant:`;

      return await this.callTextModel(fullPrompt, 0.6);
    } catch (error) {
      console.error('Error in dietitian chat:', error);
      
      // Check for specific API errors
      if (error.message.includes('404 Not Found')) {
        throw new Error('Gemini API model not found. Please check your API key and model name.');
      } else if (error.message.includes('API key')) {
        throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY environment variable.');
      } else if (error.message.includes('quota')) {
        throw new Error('Gemini API quota exceeded. Please check your usage limits.');
      }
      
      throw new Error('Failed to get dietitian response: ' + error.message);
    }
  }

  async generateShoppingList(mealPlan) {
    try {
      const extractedIngredients = this.extractIngredientsFromMealPlan(mealPlan);

      if (extractedIngredients.length === 0) {
        throw new Error('Meal plan does not contain any ingredients to convert into a shopping list');
      }

      // Normalize with LLM to reduce duplicates (e.g., onion vs Onion vs red onion)
      const normalizedForList = await this.normalizeIngredientsWithModel(extractedIngredients);

      const isPlaceholderName = (name = '') => {
        const n = String(name || '').trim();
        const lower = n.toLowerCase();
        return (
          !n ||
          /^ingredient\s*\d+/i.test(n) ||
          /^item\s*\d+/i.test(n) ||
          /^recipe\s*\d+/i.test(n) ||
          lower === 'ingredient' ||
          lower === 'item'
        );
      };

      const filterGeneric = (list) => {
        const badName = (name = '') => {
          const n = String(name).toLowerCase().trim();
          return (
            !n ||
            /^ingredient\s*\d+/i.test(name) ||
            /^item\s*\d+/i.test(name) ||
            n === 'ingredient' ||
            n === 'item'
          );
        };
        return (list || []).filter((ing) => ing && !badName(ing.name));
      };

      let cleaned = filterGeneric(normalizedForList);
      if (!cleaned.length) {
        cleaned = filterGeneric(extractedIngredients);
      }

      const consolidatedIngredients = this.consolidateIngredients(cleaned);

      try {
        const prompt = `
        Create a comprehensive shopping list from these ingredients:
        
        ${JSON.stringify(consolidatedIngredients, null, 2)}
        
        Please organize the shopping list by store sections and provide the following JSON format:
        {
          "title": "Shopping List Title",
          "description": "Brief description",
          "items": [
            {
              "name": "ingredient name",
              "amount": "total quantity needed",
              "unit": "unit of measurement",
              "category": "produce|meat|dairy|pantry|frozen|bakery|beverages|other",
              "priority": "low|medium|high",
              "estimatedPrice": number (in USD, realistic grocery store prices),
              "notes": "any special notes"
            }
          ],
          "totalEstimatedCost": number (sum of all estimatedPrice values),
          "store": "suggested store type"
        }
        
        Please:
        1. Group similar items together
        2. Calculate total quantities needed
        3. Suggest appropriate store categories
        4. Estimate REALISTIC prices in USD (e.g., produce: $2-5, meat: $6-12, dairy: $3-6, pantry: $2-5)
        5. For each item, set estimatedPrice to a reasonable USD amount based on typical grocery prices
        6. Calculate totalEstimatedCost as the sum of all item prices
        7. Add helpful notes for shopping
        8. Use sensible units: whole produce (onion, garlic, tomato, potato, pepper, apple, banana, avocado, carrot, lemon, lime, orange) should be counted as pieces, not cups/oz/ml.

        IMPORTANT: Every item must have a valid estimatedPrice number greater than 0.
      `;

        const text = await this.callTextModel(prompt, 0.3);

        // Try to parse JSON directly first
        try {
          const parsed = JSON.parse(text);

          // Validate and fix shopping list items - map to correct shopping categories
          const categoryMap = {
            'protein': 'meat',
            'meat': 'meat',
            'vegetable': 'produce',
            'fruit': 'produce',
            'produce': 'produce',
            'grain': 'pantry',
            'dairy': 'dairy',
            'fat': 'pantry',
            'spice': 'pantry',
            'nut': 'pantry',
            'seed': 'pantry',
            'pantry': 'pantry',
            'frozen': 'frozen',
            'bakery': 'bakery',
            'beverages': 'beverages',
            'other': 'other'
          };

          const normalizeUnit = (unit) => {
            const u = (unit || '').toLowerCase();
            if (u === 'each') return 'piece';
            return unit || 'piece';
          };

          const fixUnitForWholeProduce = (item) => {
            const name = (item.name || '').toLowerCase();
            const category = (item.category || '').toLowerCase();
            const isWholeProduce = category === 'produce' || ['onion', 'garlic', 'tomato', 'potato', 'pepper', 'apple', 'banana', 'avocado', 'carrot', 'lemon', 'lime', 'orange'].some((n) => name.includes(n));
            if (!isWholeProduce) return item;
            const volumeUnits = ['cup', 'cups', 'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'oz', 'ounce', 'ounces'];
            if (volumeUnits.includes((item.unit || '').toLowerCase())) {
              return { ...item, unit: 'piece', amount: item.amount && item.amount !== '0' ? item.amount : '1' };
            }
            if ((item.unit || '').toLowerCase() === 'each') {
              return { ...item, unit: 'piece' };
            }
            return item;
          };

          if (parsed.items && Array.isArray(parsed.items)) {
            parsed.items = parsed.items
              .map(item => {
                if (isPlaceholderName(item.name)) return null;
                const rawCategory = (item.category || 'other').toLowerCase();
                const mappedCategory = categoryMap[rawCategory] || 'other';
                
                return fixUnitForWholeProduce({
                  ...item,
                  amount: item.amount || '1',
                  unit: normalizeUnit(item.unit),
                  category: mappedCategory,
                  priority: item.priority || 'medium',
                  purchased: item.purchased || false
                });
              })
              .filter(Boolean);
            if (!parsed.items.length) {
              throw new Error('Parsed items empty after placeholder filter');
            }
          }

          return parsed;
        } catch (directParseError) {
          logMealplan('❌ Direct parsing failed, trying extraction methods...');
        }

        // Try multiple JSON extraction methods
        let jsonString = null;

        // Method 1: Extract JSON from markdown code blocks (```json ... ```)
        const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (markdownMatch) {
          jsonString = markdownMatch[1].trim();
          logMealplan('📝 Found JSON in markdown code block', { length: jsonString.length });
        }

        // Method 2: Look for JSON between curly braces
        if (!jsonString) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonString = jsonMatch[0];
            logMealplan('🔍 Found JSON match', { length: jsonString.length });
          }
        }

        // Method 3: Look for JSON starting with { and ending with }
        if (!jsonString) {
          const startIndex = text.indexOf('{');
          const lastIndex = text.lastIndexOf('}');
          if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
            jsonString = text.substring(startIndex, lastIndex + 1);
            logMealplan('📍 Found JSON by position', { length: jsonString.length });
          }
        }

        if (jsonString) {
          // Try parsing the JSON as-is first
          try {
            const parsed = JSON.parse(jsonString);
            logMealplan('✅ Successfully parsed shopping list');

            // Category mapping function
            const categoryMap = {
              'protein': 'meat',
              'meat': 'meat',
              'vegetable': 'produce',
              'fruit': 'produce',
              'produce': 'produce',
              'grain': 'pantry',
              'dairy': 'dairy',
              'fat': 'pantry',
              'spice': 'pantry',
              'nut': 'pantry',
              'seed': 'pantry',
              'pantry': 'pantry',
              'frozen': 'frozen',
              'bakery': 'bakery',
              'beverages': 'beverages',
              'other': 'other'
            };

            // Validate and fix shopping list items
            if (parsed.items && Array.isArray(parsed.items)) {
              parsed.items = parsed.items
                .map(item => {
                  if (isPlaceholderName(item.name)) return null;
                  const rawCategory = (item.category || 'other').toLowerCase();
                  const mappedCategory = categoryMap[rawCategory] || 'other';
                  
                  return fixUnitForWholeProduce({
                    ...item,
                    amount: item.amount || '1',
                    unit: normalizeUnit(item.unit),
                    category: mappedCategory,
                    priority: item.priority || 'medium',
                    purchased: item.purchased || false
                  });
                })
                .filter(Boolean);
              if (!parsed.items.length) {
                throw new Error('Parsed items empty after placeholder filter');
              }
            }

            return parsed;
          } catch (parseError) {
            console.error('❌ JSON parsing failed:', parseError.message);
            logMealplan('Raw JSON preview:', jsonString.substring(0, 500));

            // Try cleaning the JSON
            const repairShoppingListJson = (raw) => {
              if (!raw) return raw;
              let cleaned = raw.replace(/```json|```/gi, '');
              cleaned = cleaned.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
              cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/,\s*,/g, ',');
              cleaned = cleaned.replace(/"notes"\s*:\s*"[^"\n]*$/gm, '"notes": ""');
              const lastBrace = cleaned.lastIndexOf('}');
              if (lastBrace !== -1) {
                cleaned = cleaned.slice(0, lastBrace + 1);
              }
              return cleaned;
            };

            const cleanedJson = repairShoppingListJson(jsonString);

            try {
              const cleanedParsed = JSON.parse(cleanedJson);
              logMealplan('✅ Successfully parsed with cleaning!');

              // Category mapping function
              const categoryMap = {
                'protein': 'meat',
                'meat': 'meat',
                'vegetable': 'produce',
                'fruit': 'produce',
                'produce': 'produce',
                'grain': 'pantry',
                'dairy': 'dairy',
                'fat': 'pantry',
                'spice': 'pantry',
                'nut': 'pantry',
                'seed': 'pantry',
                'pantry': 'pantry',
                'frozen': 'frozen',
                'bakery': 'bakery',
                'beverages': 'beverages',
                'other': 'other'
              };

              // Validate and fix shopping list items
                  if (cleanedParsed.items && Array.isArray(cleanedParsed.items)) {
                    cleanedParsed.items = cleanedParsed.items
                      .map(item => {
                        if (isPlaceholderName(item.name)) return null;
                        const rawCategory = (item.category || 'other').toLowerCase();
                        const mappedCategory = categoryMap[rawCategory] || 'other';
                        
                        return fixUnitForWholeProduce({
                          ...item,
                          amount: item.amount || '1',
                          unit: normalizeUnit(item.unit),
                          category: mappedCategory,
                          priority: item.priority || 'medium',
                          purchased: item.purchased || false
                        });
                      })
                      .filter(Boolean);
                    if (!cleanedParsed.items.length) {
                      throw new Error('Parsed items empty after placeholder filter');
                    }
                  }

              return cleanedParsed;
            } catch (cleanedParseError) {
              console.error('❌ Even cleaning failed:', cleanedParseError.message);
              throw new Error('Could not parse JSON from Gemini response after cleaning');
            }
          }
        }

        throw new Error('Could not find JSON in Gemini response');
      } catch (aiError) {
        console.warn('⚠️ Gemini shopping list generation failed, using deterministic fallback:', aiError.message);
        return this.buildFallbackShoppingList(consolidatedIngredients, mealPlan);
      }
    } catch (error) {
      console.error('Error generating shopping list:', error);
      throw new Error('Failed to generate shopping list: ' + error.message);
    }
  }

  extractIngredientsFromMealPlan(mealPlan = {}) {
    const ingredients = [];
    const onionLog = [];

    if (!mealPlan || !Array.isArray(mealPlan.days)) {
      return ingredients;
    }

    mealPlan.days.forEach(day => {
      const meals = Array.isArray(day?.meals) ? day.meals : [];

      meals.forEach(meal => {
        const recipes = Array.isArray(meal?.recipes) ? meal.recipes : [];

        if (recipes.length > 0) {
          recipes.forEach(recipe => {
            const recipeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];

            recipeIngredients.forEach(ingredient => {
              const normalised = this.normalizeIngredient(ingredient);
              if (normalised) {
                ingredients.push(normalised);
                const lower = normalised.name.toLowerCase();
                if (lower.includes('onion')) {
                  onionLog.push({ source: 'recipe', recipe: recipe.name, ingredient: normalised });
                }
              }
            });
          });
          return;
        }

        const mealLevelIngredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
        mealLevelIngredients.forEach(ingredient => {
          const normalised = this.normalizeIngredient(ingredient);
          if (normalised) {
            ingredients.push(normalised);
            const lower = normalised.name.toLowerCase();
            if (lower.includes('onion')) {
              onionLog.push({ source: 'meal', meal: meal.type, ingredient: normalised });
            }
          }
        });
      });
    });

    if (onionLog.length && process.env.LOG_MEALPLAN === 'true') {
      logMealplan('🧅 Onion entries collected for shopping list:', onionLog);
    }

    return ingredients;
  }

  normalizeIngredient(rawIngredient = {}) {
    const nameCandidate = rawIngredient.name || rawIngredient.item || rawIngredient.ingredient;
    if (!nameCandidate) {
      return null;
    }

    const amountCandidate = rawIngredient.amount ?? rawIngredient.quantity ?? rawIngredient.qty ?? '1';
    const unitCandidate = rawIngredient.unit || rawIngredient.measure || rawIngredient.measurement || '';
    const categoryCandidate = rawIngredient.category || rawIngredient.type || 'other';

    const normalised = {
      name: String(nameCandidate).trim(),
      amount: String(amountCandidate || '1').trim() || '1',
      unit: String(unitCandidate || 'unit').trim() || 'unit',
      category: String(categoryCandidate || 'other').trim().toLowerCase() || 'other'
    };

    if (!normalised.name) {
      return null;
    }

    if (rawIngredient.notes) {
      normalised.notes = rawIngredient.notes;
    }

    if (rawIngredient.estimatedPrice !== undefined) {
      const numericPrice = Number(rawIngredient.estimatedPrice);
      if (!Number.isNaN(numericPrice)) {
        normalised.estimatedPrice = numericPrice;
      }
    }

    return normalised;
  }

  buildFallbackShoppingList(consolidatedIngredients, mealPlan = {}) {
    const items = consolidatedIngredients.map(item => {
      const fallbackItem = {
        name: item.name,
        amount: item.amount || '1',
        unit: item.unit || 'unit',
        category: item.category || 'other',
        priority: 'medium',
        purchased: false
      };

      if (item.notes) {
        fallbackItem.notes = item.notes;
      }

      if (item.estimatedPrice !== undefined) {
        fallbackItem.estimatedPrice = item.estimatedPrice;
      }

      return fallbackItem;
    });

    // Add estimated prices if missing based on intelligent analysis
    const estimatedItems = items.map(item => {
      if (!item.estimatedPrice || item.estimatedPrice === 0) {
        const name = (item.name || '').toLowerCase();
        const amount = parseFloat(item.amount) || 1;
        const unit = (item.unit || '').toLowerCase();
        
        // Specific ingredient pricing (more accurate)
        let basePrice = 3.0;
        
        // Proteins
        if (name.includes('chicken') || name.includes('turkey')) {
          basePrice = amount >= 2 ? 8.0 : 5.5;
        } else if (name.includes('beef') || name.includes('steak') || name.includes('lamb')) {
          basePrice = amount >= 2 ? 12.0 : 7.0;
        } else if (name.includes('fish') || name.includes('salmon') || name.includes('tuna') || name.includes('shrimp')) {
          basePrice = amount >= 2 ? 14.0 : 8.0;
        } else if (name.includes('pork') || name.includes('bacon') || name.includes('sausage')) {
          basePrice = amount >= 2 ? 9.0 : 5.5;
        } else if (name.includes('egg')) {
          basePrice = amount >= 12 ? 4.5 : 3.0;
        
        // Dairy
        } else if (name.includes('milk') || name.includes('cream')) {
          basePrice = amount >= 2 ? 5.5 : 3.5;
        } else if (name.includes('cheese')) {
          basePrice = amount >= 1 ? 6.0 : 4.0;
        } else if (name.includes('yogurt')) {
          basePrice = amount >= 4 ? 5.0 : 3.5;
        } else if (name.includes('butter')) {
          basePrice = 4.5;
        
        // Produce
        } else if (name.includes('lettuce') || name.includes('spinach') || name.includes('kale')) {
          basePrice = 2.5;
        } else if (name.includes('tomato') || name.includes('pepper') || name.includes('onion')) {
          basePrice = amount >= 5 ? 4.0 : 2.5;
        } else if (name.includes('avocado')) {
          basePrice = amount >= 3 ? 5.0 : 2.0;
        } else if (name.includes('broccoli') || name.includes('cauliflower') || name.includes('carrot')) {
          basePrice = amount >= 3 ? 4.5 : 3.0;
        } else if (name.includes('potato')) {
          basePrice = amount >= 5 ? 5.0 : 3.0;
        } else if (name.includes('apple') || name.includes('banana') || name.includes('orange')) {
          basePrice = amount >= 5 ? 4.0 : 2.5;
        } else if (name.includes('berry') || name.includes('strawberry') || name.includes('blueberry')) {
          basePrice = amount >= 2 ? 6.0 : 4.0;
        
        // Grains & Pantry
        } else if (name.includes('rice') || name.includes('pasta') || name.includes('noodle')) {
          basePrice = amount >= 3 ? 5.0 : 3.0;
        } else if (name.includes('bread') || name.includes('baguette') || name.includes('roll')) {
          basePrice = 3.5;
        } else if (name.includes('flour') || name.includes('sugar')) {
          basePrice = amount >= 5 ? 6.0 : 3.5;
        } else if (name.includes('oat') || name.includes('cereal')) {
          basePrice = 4.0;
        
        // Oils & Condiments (usually small amounts)
        } else if (name.includes('oil') || name.includes('vinegar')) {
          basePrice = unit.includes('tsp') || unit.includes('tbsp') || unit.includes('tablespoon') || unit.includes('teaspoon') ? 0.5 : 6.0;
        } else if (name.includes('sauce') || name.includes('paste') || name.includes('stock') || name.includes('broth')) {
          basePrice = 3.0;
        
        // Spices & Herbs (usually very small amounts)
        } else if (name.includes('salt') || name.includes('pepper') || name.includes('spice') || name.includes('herb') || 
                   name.includes('cumin') || name.includes('paprika') || name.includes('oregano') || name.includes('thyme') ||
                   name.includes('basil') || name.includes('parsley') || name.includes('cilantro')) {
          basePrice = unit.includes('tsp') || unit.includes('tbsp') || unit.includes('tablespoon') || unit.includes('teaspoon') ? 0.3 : 2.5;
        
        // Nuts & Seeds
        } else if (name.includes('almond') || name.includes('walnut') || name.includes('cashew') || name.includes('pecan')) {
          basePrice = amount >= 2 ? 9.0 : 5.5;
        } else if (name.includes('seed') || name.includes('chia') || name.includes('flax')) {
          basePrice = 4.0;
        
        // Canned/Packaged
        } else if (name.includes('can') || name.includes('canned')) {
          basePrice = 2.0;
        
        // Category-based fallback
        } else {
          const categoryPrices = {
            'produce': 3.5,
            'meat': 8.0,
            'dairy': 4.5,
            'pantry': 4.0,
            'frozen': 5.0,
            'bakery': 3.0,
            'beverages': 3.5,
            'other': 3.0
          };
          basePrice = categoryPrices[item.category] || 3.0;
        }
        
        // Adjust for very small units (tsp, tbsp)
        if (unit.includes('tsp') || unit.includes('teaspoon')) {
          basePrice = Math.min(basePrice, 0.5);
        } else if (unit.includes('tbsp') || unit.includes('tablespoon')) {
          basePrice = Math.min(basePrice, 1.0);
        }
        
        item.estimatedPrice = parseFloat(basePrice.toFixed(2));
      }
      return item;
    });

    const totalEstimatedCost = estimatedItems.reduce((sum, item) => {
      return sum + (item.estimatedPrice || 0);
    }, 0);

    return {
      title: mealPlan?.title ? `${mealPlan.title} Shopping List` : 'Shopping List',
      description: 'Generated from meal plan ingredients',
      items: estimatedItems,
      totalEstimatedCost: parseFloat(totalEstimatedCost.toFixed(2)),
      store: 'Grocery store'
    };
  }

  buildIngredientBlueprint({ preferences, duration, randomSeed }) {
    const random = this.createSeededRandom(randomSeed);
    const mealTypes = this.resolveMealTypes(preferences);
    const disliked = new Set((preferences.dislikedFoods || []).map(item => item.toLowerCase()));
    const allergies = new Set((preferences.allergies || []).map(item => item.toLowerCase()));
    const dietType = (preferences.dietType || 'balanced').toLowerCase();
    const forcedCuisineRaw = (
      preferences.cuisine ||
      preferences.preferredCuisine ||
      this.detectCuisineFromNotes(preferences.additionalNotes) ||
      null
    );
    const forcedCuisine = forcedCuisineRaw ? forcedCuisineRaw.toLowerCase() : null;

    const blueprint = [];
    for (let dayIndex = 0; dayIndex < duration; dayIndex += 1) {
      const cuisine = forcedCuisine || null;
      const meals = mealTypes.map(type => {
        const ingredients = this.pickIngredientsForMeal({
          mealType: type,
          random,
          disliked,
          allergies,
          dietType
        });

        return {
          type,
          cuisine,
          suggestedTime: preferences.mealTimes?.[type] || this.defaultMealTimes()[type],
          ingredients
        };
      });

      blueprint.push({
        day: dayIndex + 1,
        cuisine,
        meals
      });
    }

    return blueprint;
  }

  pickIngredientsForMeal({ mealType, random, disliked, allergies, dietType }) {
    const pool = [...(INGREDIENT_LIBRARY[mealType] || INGREDIENT_LIBRARY.breakfast)];

    const filteredPool = pool.filter(item => {
      const lowerName = item.name.toLowerCase();
      if (disliked.has(lowerName)) return false;
      if (allergies.has(lowerName)) return false;

      if (dietType.includes('vegetarian')) {
        if (['chicken', 'beef', 'turkey', 'salmon'].some(meat => lowerName.includes(meat))) {
          return false;
        }
      }

      if (dietType.includes('vegan')) {
        if (['egg', 'yogurt', 'cheese', 'butter', 'milk'].some(dairy => lowerName.includes(dairy))) {
          return false;
        }
        if (['chicken', 'beef', 'turkey', 'salmon', 'fish'].some(meat => lowerName.includes(meat))) {
          return false;
        }
      }

      if (dietType.includes('pescatarian')) {
        if (['beef', 'turkey', 'chicken'].some(meat => lowerName.includes(meat))) {
          return false;
        }
      }

      return true;
    });

    const baseSize = mealType === 'snack' ? 2 : 3;
    const selectionSize = baseSize + Math.round(random() * (mealType === 'snack' ? 1 : 2));
    const ingredients = [];
    const workingPool = filteredPool.length > 0 ? filteredPool : pool;

    const usedIndices = new Set();
    while (ingredients.length < selectionSize && usedIndices.size < workingPool.length) {
      const index = Math.floor(random() * workingPool.length);
      if (usedIndices.has(index)) {
        continue;
      }
      usedIndices.add(index);
      ingredients.push(workingPool[index]);
    }

    return ingredients;
  }

  resolveMealTypes(preferences) {
    const hasSnacks = preferences.includeSnacks ?? true;
    const mealTimes = preferences.mealTimes || {};

    const baseTypes = ['breakfast', 'lunch', 'dinner'];
    if (hasSnacks || mealTimes.snack) {
      baseTypes.push('snack');
    }

    return baseTypes;
  }

  defaultMealTimes() {
    return {
      breakfast: '08:00',
      lunch: '12:30',
      dinner: '19:00',
      snack: '15:30'
    };
  }

  createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  buildFallbackMealPlan({ blueprint, preferences, duration, randomSeed }) {
    const today = new Date();
    const dietLabel = this.capitalize(preferences.dietType || 'balanced');
    const random = this.createSeededRandom((randomSeed || Date.now()) + 2024);

    const days = blueprint.map((blueprintDay, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const cuisine = blueprintDay.cuisine || 'Any';
      const cuisineName = this.capitalizeWords(cuisine);
      const cuisineSlug = cuisineName.toLowerCase().replace(/\s+/g, '-');

      const meals = blueprintDay.meals.map(meal => {
        const recipeNameBase = `${this.capitalize(meal.type)} Bowl`;
        const keyIngredients = meal.ingredients.slice(0, 3).map(item => item.name);
        const recipeName = this.buildFallbackRecipeName({
          mealType: meal.type,
          cuisine: cuisineName,
          keyIngredients,
          random
        }) || recipeNameBase;

        const ingredients = meal.ingredients.map(item => ({
          name: item.name,
          amount: item.amount || '1',
          unit: item.unit || 'portion',
          category: item.category || 'other'
        }));

        return {
          type: meal.type,
          scheduledTime: meal.suggestedTime || this.defaultMealTimes()[meal.type],
          recipes: [
            {
              name: recipeName,
              description: `${cuisineName}-inspired ${meal.type} featuring ${this.formatIngredientList(keyIngredients)}.`,
              prepTime: 10,
              cookTime: 15,
              servings: 1,
              ingredients,
              instructions: [
                'Prepare the ingredients as needed (wash, chop, cook where appropriate).',
                `Combine the ingredients to create a ${cuisineName}-style ${meal.type}.`,
                `Finish with herbs, spices, or condiments that complement ${cuisineName} flavours.`
              ],
              nutrition: {
                calories: 450,
                protein: 25,
                carbs: 45,
                fat: 18
              },
              tags: ['fallback', meal.type, cuisineSlug],
              difficulty: 'easy'
            }
          ],
          totalNutrition: {
            calories: 450,
            protein: 25,
            carbs: 45,
            fat: 18
          },
          cuisine: cuisineName
        };
      });

      return {
        date: date.toISOString().split('T')[0],
        cuisine: cuisineName,
        meals
      };
    });

    return {
      title: `${dietLabel} ${duration}-Day Meal Plan (Fallback)`,
      description: 'Generated locally using selected ingredients because the AI response could not be parsed.',
      days
    };
  }

  capitalize(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  capitalizeWords(value) {
    if (!value) return '';
    return value
      .split(/\s|-/)
      .filter(Boolean)
      .map(word => this.capitalize(word))
      .join(' ');
  }

  formatIngredientList(ingredients) {
    if (!ingredients || ingredients.length === 0) {
      return 'fresh pantry staples';
    }
    const formatted = ingredients.map(item => this.capitalizeWords(item));
    if (formatted.length === 1) return formatted[0];
    const last = formatted.pop();
    return `${formatted.join(', ')} and ${last}`;
  }

  buildFallbackRecipeName({ mealType, cuisine, keyIngredients, random }) {
    const templates = FALLBACK_NAME_TEMPLATES[mealType] || FALLBACK_NAME_TEMPLATES.default;
    const template = templates[Math.floor(random() * templates.length)];
    const main = this.capitalizeWords(keyIngredients[0] || mealType);
    const second = this.capitalizeWords(keyIngredients[1] || keyIngredients[0] || mealType);
    return template
      .replace('{cuisine}', cuisine)
      .replace('{main}', main)
      .replace('{second}', second)
      .replace('{course}', this.capitalize(mealType));
  }

  consolidateIngredients(ingredients) {
    const consolidated = {};

    const parseAmountNumber = (value, unit, name) => {
      const raw = String(value || '').trim();
      if (!raw) return null;

      const unicodeFractions = {
        '¼': '1/4',
        '½': '1/2',
        '¾': '3/4',
        '⅓': '1/3',
        '⅔': '2/3'
      };
      const replaced = raw.replace(/[¼½¾⅓⅔]/g, (m) => unicodeFractions[m] || m);

      // Handle patterns like "1 1/2"
      const mixedMatch = replaced.match(/^(\d+)\s+(\d+)\/(\d+)$/);
      if (mixedMatch) {
        const whole = Number(mixedMatch[1]);
        const num = Number(mixedMatch[2]);
        const den = Number(mixedMatch[3]);
        if (den) return whole + num / den;
      }

      // Handle simple fractions "3/4"
      const fracMatch = replaced.match(/^(\d+)\/(\d+)$/);
      if (fracMatch) {
        const num = Number(fracMatch[1]);
        const den = Number(fracMatch[2]);
        if (den) return num / den;
      }

      // Heuristic: amounts like "34" or "12" for cups of onion likely mean 3/4 or 1/2
      if (/^\d{2}$/.test(replaced) && unit && /cup/i.test(unit) && name && /onion/i.test(name)) {
        const first = replaced[0];
        const second = replaced[1];
        if (['2', '4', '8'].includes(second)) {
          const mapped = `${first}/${second}`;
          const f = mapped.split('/');
          const num = Number(f[0]);
          const den = Number(f[1]);
          if (den) return num / den;
        }
      }

      const num = Number(replaced.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num) && num > 0) return num;
      return null;
    };

    const normalizeName = (name) => {
      if (!name) return '';
      const base = String(name).toLowerCase().trim();
      const parts = base.split(/\s+/).filter(Boolean);
      // Remove common descriptors to reduce variants (e.g., red onion -> onion)
      const remove = new Set(['red', 'yellow', 'white', 'small', 'large', 'medium', 'sweet']);
      const filtered = parts.filter((p) => !remove.has(p));
      return (filtered.length ? filtered.join(' ') : parts.join(' ')).trim();
    };

    ingredients.forEach(ingredient => {
      if (!ingredient || !ingredient.name) {
        return;
      }

      const unitKey = (ingredient.unit || 'unit').toLowerCase();
      const nameKey = normalizeName(ingredient.name);
      const key = `${nameKey}__${unitKey}`;

      if (consolidated[key]) {
        const existingAmount = parseAmountNumber(consolidated[key].amount, unitKey, nameKey);
        const newAmount = parseAmountNumber(ingredient.amount, unitKey, nameKey);

        if (!Number.isNaN(existingAmount) && !Number.isNaN(newAmount)) {
          consolidated[key].amount = (existingAmount + newAmount).toString();
        } else if (!consolidated[key].amount) {
          consolidated[key].amount = ingredient.amount;
        }

        if (!consolidated[key].notes && ingredient.notes) {
          consolidated[key].notes = ingredient.notes;
        }

        if (ingredient.estimatedPrice !== undefined) {
          const numericPrice = Number(ingredient.estimatedPrice);
          if (!Number.isNaN(numericPrice)) {
            const existingPrice = Number(consolidated[key].estimatedPrice) || 0;
            consolidated[key].estimatedPrice = existingPrice + numericPrice;
          }
        }
      } else {
        consolidated[key] = {
          ...ingredient,
          name: this.capitalizeWords(nameKey || ingredient.name)
        };
      }
    });

    return Object.values(consolidated);
  }

  async getRecipeSuggestion(ingredients, dietType, mealType) {
    try {
      const prompt = `
        Suggest a recipe for ${mealType} using these ingredients: ${ingredients.join(', ')}
        
        Diet type: ${dietType}
        
        Please provide a recipe in JSON format:
        {
          "name": "Recipe Name",
          "description": "Brief description",
          "prepTime": number_in_minutes,
          "cookTime": number_in_minutes,
          "servings": number,
          "ingredients": [
            {
              "name": "ingredient name",
              "amount": "quantity",
              "unit": "unit of measurement",
              "category": "protein|vegetable|fruit|grain|dairy|fat|spice|other"
            }
          ],
          "instructions": ["step 1", "step 2", ...],
          "nutrition": {
            "calories": number,
            "protein": number,
            "carbs": number,
            "fat": number
          },
          "difficulty": "easy|medium|hard"
        }
      `;

      const text = await this.callTextModel(prompt, 0.4);
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      throw new Error('Could not parse JSON from Gemini response');
    } catch (error) {
      console.error('Error getting recipe suggestion:', error);
      throw new Error('Failed to get recipe suggestion: ' + error.message);
    }
  }
}

module.exports = new GeminiService();
