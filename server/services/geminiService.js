const { GoogleGenerativeAI } = require('@google/generative-ai');
const { searchRecipes, getRecipeById } = require('./recipeSearch/searchService');
const { logEvent } = require('../utils/logger');
const { ensureMealImage } = require('./leonardoService');
const { groqChat } = require('./groqClient');
// Node 18+ has global fetch; no import required.

const EMBED_HOST = process.env.EMBEDDING_HOST || process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const LOG_MEALPLAN = process.env.LOG_MEALPLAN === 'true';
const logMealplan = (...args) => {
  if (LOG_MEALPLAN) console.log(...args);
};

// Summarize a user recipe request into a concise search text using Groq (if available)
const summarizeSearchText = async (message, intent, conversationHistory = []) => {
  if (!groqChat || !process.env.GROQ_API_KEY) return message;
  try {
    const recentContext = (() => {
      const lastAssistant = [...conversationHistory].reverse().find((m) => m.role === 'assistant')?.content || '';
      const lastUser = [...conversationHistory].reverse().find((m) => m.role === 'user')?.content || '';
      return { lastAssistant, lastUser };
    })();
    const prompt = [
      "You rewrite the user's request into a concise recipe search query (one short sentence).",
      "Focus on dish type, meal type, cuisine, diet, and key include/exclude ingredients.",
      "Do NOT add opinions, instructions, or numbers; keep it 10-25 words, plain text.",
      "If the conversation already lists recipes, infer style/meal type from the latest assistant reply."
    ].join(" ");
    const hints = {
      message,
      mealType: intent?.mealType || null,
      diet: intent?.diet || null,
      include: intent?.includeIngredients || null,
      exclude: intent?.excludeIngredients || null,
      cuisine: intent?.cuisine || null,
      lastAssistant: recentContext.lastAssistant,
      lastUser: recentContext.lastUser
    };
    const { content } = await groqChat({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Request: ${message}. Hints: ${JSON.stringify(hints)}` }
      ],
      maxTokens: 80,
      temperature: 0.2
    });
    const cleaned = (content || "").replace(/[\n\r]+/g, " ").trim();
    return cleaned.length ? cleaned : message;
  } catch (err) {
    console.warn("ℹ️ Groq search summarizer failed; using raw message", err.message);
    return message;
  }
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

  async fetchWeatherContext() {
    const lat = process.env.WEATHER_LAT;
    const lon = process.env.WEATHER_LON;
    if (!lat || !lon) return null;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weathercode&timezone=UTC`;
      const res = await fetch(url, { timeout: 5000 });
      if (!res.ok) return null;
      const data = await res.json();
      const current = data?.current;
      if (!current) return null;
      const temp = current.temperature_2m;
      const feels = current.apparent_temperature;
      const precip = current.precipitation;
      const code = current.weathercode;
      const describeCode = (c) => {
        if (c === undefined || c === null) return '';
        if ([0].includes(c)) return 'clear';
        if ([1, 2, 3].includes(c)) return 'partly cloudy';
        if ([45, 48].includes(c)) return 'foggy';
        if ([51, 53, 55, 56, 57].includes(c)) return 'drizzle';
        if ([61, 63, 65, 66, 67].includes(c)) return 'rain';
        if ([71, 73, 75, 77, 85, 86].includes(c)) return 'snow';
        if ([80, 81, 82].includes(c)) return 'showers';
        if ([95, 96, 99].includes(c)) return 'thunderstorms';
        return 'mixed';
      };
      const parts = [];
      if (temp !== undefined) parts.push(`temp ${temp}°C`);
      if (feels !== undefined) parts.push(`feels ${feels}°C`);
      if (precip !== undefined) parts.push(precip > 0 ? `precip ${precip} mm` : 'dry');
      const desc = describeCode(code);
      if (desc) parts.push(desc);
      return parts.filter(Boolean).join(', ');
    } catch {
      return null;
    }
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
      // Add day/story context: weekday/weekend difficulty/quick bias, seasonality
      const today = new Date();
      const month = today.getMonth() + 1;
      const dayOfWeek = today.getDay(); // 0=Sun
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (!filters.difficulty && preferences?.difficulty !== 'hard') {
        filters.difficulty = isWeekend ? 'medium' : 'easy';
      }
      if (!preferences?.quickMeal && !isWeekend) {
        filters.quick = true;
      }
      const seasonalByMonth = {
        1: ['citrus', 'kale'],
        2: ['citrus', 'cabbage'],
        3: ['asparagus', 'peas'],
        4: ['asparagus', 'spinach'],
        5: ['strawberry', 'peas'],
        6: ['berries', 'tomato'],
        7: ['berries', 'corn'],
        8: ['tomato', 'zucchini'],
        9: ['apple', 'squash'],
        10: ['pumpkin', 'mushroom'],
        11: ['pumpkin', 'brussels sprouts'],
        12: ['citrus', 'potato'],
      };
      if ((!filters.include_ingredients || !filters.include_ingredients.length) && seasonalByMonth[month]) {
        filters.include_ingredients = seasonalByMonth[month];
      }
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

    const res = await searchRecipes(filters, { size, randomSeed, logSearch: LOG_SEARCH || LOG_MEALPLAN });
    let results = res;
    if (res?.results?.length) {
      res.results = res.results.map((r) => ({
        ...r,
        nutrition: this.extractNutritionFromSource(r)
      }));
    }

    // Fallback: if nothing returned and a diet filter was applied, retry without diet_tags
    if ((!results.results || results.results.length === 0) && filters.diet_tags?.length) {
      const relaxedFilters = { ...filters };
      // keep diet tags; relax goal/activity first
      delete relaxedFilters.goal_fit;
      delete relaxedFilters.activity_fit;
      results = await searchRecipes(relaxedFilters, { size, logSearch: LOG_SEARCH || LOG_MEALPLAN });
      logMealplan(`⚠️ ${mealType} search empty; retried without goals/activity (diet tags kept)`, {
        dietTags: filters.diet_tags,
        relaxedHits: results?.results?.length || 0
      });
    }

    // LLM pass to discard candidates that violate user constraints
    if (results?.results?.length) {
      try {
        const candidateData = results.results.map((r, idx) => ({
          id: r.id || r._id || `cand-${idx}`,
          title: r.title || r.name,
          calories: r.nutrition?.calories ?? r.calories,
          protein: r.nutrition?.protein ?? r.protein ?? r.protein_grams ?? r.protein_g,
          time: r.total_time_min ?? r.total_time_minutes ?? r.prep_time_minutes,
          tags: r.diet_tags || r.tags || []
        }));
        const filterPrompt = `
        Meal type: ${mealType}
        User preferences: ${JSON.stringify(preferences)}
        Candidates:
        ${JSON.stringify(candidateData, null, 2)}

        Decide which candidates respect the user's constraints (diet, allergies, dislikes, meal type).
        Respond with ONLY JSON: {"keepIds":["id1","id2",...]} using the ids above.
        If unsure, keep all. Do NOT invent recipes or ids.
        `;
        const filterResp = await this.callTextModel(filterPrompt, 0.15, 'json');
        const parsedFilter = (() => {
          try {
            const cleaned = (filterResp || '').replace(/```json|```/gi, '').trim();
            return JSON.parse(cleaned);
          } catch {
            return null;
          }
        })();
        const keepIds = Array.isArray(parsedFilter?.keepIds)
          ? parsedFilter.keepIds.map((v) => String(v))
          : null;
        if (keepIds && keepIds.length) {
          const filtered = results.results.filter((r, idx) => {
            const id = r.id || r._id || `cand-${idx}`;
            return keepIds.includes(String(id));
          });
          if (filtered.length) {
            results.results = filtered;
          }
        }
      } catch (filterErr) {
        logMealplan("⚠️ LLM candidate filter failed", filterErr?.message || filterErr);
      }
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
    logMealplan(`🍽️ Candidates fetched for ${mealType}: ${shuffled.length} (filtered from ${rawResults.length})`);

    const buildNutrition = (src) => {
      const nutrition = {};
      const addNumber = (key, ...candidates) => {
        for (const val of candidates) {
          const num = typeof val === 'string' ? Number(val) : Number(val);
          if (Number.isFinite(num)) {
            nutrition[key] = num;
            return;
          }
        }
      };
      const nSrc = src?.nutrition || src || {};
      
      addNumber('calories', nSrc.calories, src?.calories);
      addNumber('protein', nSrc.protein, nSrc.protein_g, nSrc.protein_grams, src?.protein, src?.protein_g, src?.protein_grams);
      addNumber('carbs', nSrc.carbs, nSrc.carbs_g, nSrc.carbs_grams, src?.carbs, src?.carbs_g, src?.carbs_grams);
      addNumber('fat', nSrc.fat, nSrc.fat_g, nSrc.fat_grams, src?.fat, src?.fat_g, src?.fat_grams);
      addNumber('fiber', nSrc.fiber, nSrc.fiber_g, nSrc.fiber_grams, src?.fiber, src?.fiber_g, src?.fiber_grams);
      addNumber('sugar', nSrc.sugar, nSrc.sugar_g, nSrc.sugar_grams, src?.sugar, src?.sugar_g, src?.sugar_grams);
      return nutrition;
    };

    return shuffled.map(r => {
      const esNutrition = buildNutrition(r);
      const llmNutrition = r.nutrition;
      const nutrition = this.hasNutritionData(esNutrition)
        ? esNutrition
        : (this.hasNutritionData(llmNutrition) ? llmNutrition : this.ensureNutrition(esNutrition, mealType));
      const aiGenerated = r.id && String(r.id).startsWith('llm-');
      const title = this.cleanTitle(r.title, preferences?.dietType);
      if (LOG_MEALPLAN && r.id && String(r.id).startsWith('llm-')) {
        logMealplan('🧠 LLM candidate used', {
          id: r.id,
          title,
          meal_type: r.meal_type,
          calories: nutrition.calories,
          protein: nutrition.protein
        });
      }
      return {
        id: r.id || r._id,
        title,
        ai_generated: aiGenerated,
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
      const text = await this.callTextModel(prompt, 0, 'json'); // deterministic, expect JSON
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
   * responseFormat: 'text' | 'json'
   */
  async callTextModel(prompt, temperature = 0.6, responseFormat = 'text') {
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
        responseFormat: responseFormat === 'json' ? { type: 'json_object' } : undefined,
        messages: [
          responseFormat === 'json'
            ? {
                role: 'system',
                content:
                  'You are a helpful assistant. Return only valid JSON with no markdown fences, no extra text.'
              }
            : {
                role: 'system',
                content:
                  'You are a helpful nutrition assistant. Always respond in plain text, not JSON, not code fences. Use short paragraphs and bullet lists where appropriate.'
              },
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
  async normalizeIngredientsWithModel(rawIngredients = [], attempt = 0) {
    try {
      const prompt = `
      You are normalizing grocery ingredients. Return ONLY a JSON array of objects:
      [
        { "name": "<canonical name>", "amount": "<string>", "unit": "<string>", "category": "protein|vegetable|fruit|grain|dairy|fat|spice|nut|seed|broth|herb|other" }
      ]
      Rules:
      - Do NOT combine or add quantities; return one object per input item and keep the SAME number of items as the input.
      - Do NOT invent or substitute different ingredients. The output name must describe the SAME ingredient as the input.
      - Canonicalize names to the base grocery item (e.g., "orange" and "oranges" -> "oranges"; "green apple" and "apple" -> "apples").
      - Normalize close synonyms to one canonical name (e.g., "ground beef", "minced beef", "hamburger" -> "ground beef"; "chinese tofu" -> "tofu").
      - Keep descriptors that change the actual item (e.g., "olive oil" vs "vegetable oil"; "red wine vinegar" vs "apple cider vinegar").
      - Remove prep adjectives like "chopped", "diced", "sliced", "fresh", "large/small".
      - Preserve amount/unit as provided; if missing, set amount "1" and unit "unit".
      - Category must be one of the allowed values above.
      Examples:
      - "ground beef 80/20" -> name "ground beef"
      - "hamburger meat" -> name "ground beef"
      - "green apple" -> name "apples"
      - "oranges" -> name "oranges"
      Input ingredients:
      ${JSON.stringify(rawIngredients, null, 2)}
      `;
      const text = await this.callTextModel(prompt, 0.2, 'json');
      const fence = text.match(/```json\s*([\s\S]*?)```/i);
      const cleaned = fence ? fence[1] : text.replace(/```/g, '');
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length === rawIngredients.length) {
        return parsed;
      }
      if (attempt < 1) {
        return this.normalizeIngredientsWithModel(rawIngredients, attempt + 1);
      }
      return rawIngredients;
    } catch (err) {
      console.warn('⚠️ Ingredient normalization failed, using original list:', err.message);
      return rawIngredients;
    }
  }

  async convertVolumeToWeightWithModel(items = []) {
    const volumeUnits = new Set(['ml', 'l', 'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'c']);
    const candidates = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item && volumeUnits.has(String(item.unit || '').toLowerCase().trim()));
    if (!candidates.length) return items;

    const payload = candidates.map(({ item, idx }) => ({
      index: idx,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      category: item.category || 'other'
    }));

    const prompt = `
    Convert volume-based ingredient amounts into weight (grams) when appropriate.
    Return ONLY a JSON array of:
    [{ "index": number, "amount": number, "unit": "g|ml" }]
    Rules:
    - Use these volume conversions: 1 cup = 240 ml, 1 tbsp = 15 ml, 1 tsp = 5 ml, 1000 ml = 1 l.
    - For liquids (water, milk, cream, juice, broth, stock, oils, sauces), keep unit "ml" and convert the amount to ml.
    - For non-liquids (powders, grains, spices, herbs, cheeses, produce), convert to grams using a reasonable ingredient-specific density.
    - Do NOT change ingredient names or indices; keep the list order.
    Items: ${JSON.stringify(payload, null, 2)}
    `;

    try {
      const text = await this.callTextModel(prompt, 0.2, 'json');
      const jsonMatch = text && text.match(/\[[\s\S]*\]/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
      if (!Array.isArray(parsed)) return items;
      const mapped = [...items];
      parsed.forEach((entry) => {
        const idx = Number(entry?.index);
        if (!Number.isInteger(idx) || !mapped[idx]) return;
        const unit = String(entry?.unit || '').toLowerCase().trim();
        if (!['g', 'ml'].includes(unit)) return;
        const amount = Number(entry?.amount);
        if (!Number.isFinite(amount)) return;
        mapped[idx] = { ...mapped[idx], amount: String(amount), unit };
      });
      return mapped;
    } catch (err) {
      console.warn('⚠️ Volume-to-weight conversion failed:', err.message);
      return items;
    }
  }

  async generateMealPlan(userPreferences, duration = 7, user = null) {
    const randomSeed = Math.floor(Math.random() * 1_000_000_000);
    const mealTypes = this.resolveMealTypes(userPreferences);

    const ingredientBlueprint = this.buildIngredientBlueprint({
      preferences: userPreferences,
      duration,
      randomSeed
    });
    const weatherContext = await this.fetchWeatherContext();

    const fallbackPlan = this.buildFallbackMealPlan({
      blueprint: ingredientBlueprint,
      preferences: userPreferences,
      duration,
      randomSeed
    });

    try {
      // Generate one day at a time for better reliability
      const days = [];
      const imageTasks = [];
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
      const baseCandidateMap = {};
      for (const mealType of mealTypes) {
        // Keep pools small to avoid prompt bloat
        const sizeByType = mealType === 'snack' ? 12 : mealType === 'breakfast' ? 20 : 30;
        const targetSize = mealType === 'snack' ? 10 : mealType === 'breakfast' ? 16 : 24;
        baseCandidateMap[mealType] = await padWithLLM(
          mealType,
          await this.fetchCandidatesForMeal(mealType, userPreferences, sizeByType),
          targetSize
        );
      }

      for (let dayIndex = 0; dayIndex < duration; dayIndex++) {
        logMealplan(`📅 Generating day ${dayIndex + 1}/${duration}`);
        
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + dayIndex);
        const dateStr = currentDate.toISOString().split('T')[0];
        const weekdayLabel = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
        const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long' });
        
        // Reuse pre-fetched candidates; filter out recently used and shuffle to avoid repeats
        const filterUsed = (list = []) => {
          const filtered = list.filter((r) => r?.id && !usedRecipeIds.has(String(r.id)));
          return filtered.length ? filtered : list;
        };
        const candidateMap = mealTypes.reduce((acc, mealType) => {
          const pool = this.shuffle(filterUsed(baseCandidateMap[mealType] || []));
          // keep a small random subset per day to force variety across days
          acc[mealType] = pool.slice(0, 5);
          return acc;
        }, {});
        logMealplan(`🎲 Shuffled candidates for day ${dayIndex + 1}`, {
          ...Object.fromEntries(
            mealTypes.map((m) => [
              m,
              (candidateMap[m] || []).slice(0, 5).map((c) => ({ id: c.id, title: c.title }))
            ])
          )
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
              ...Object.fromEntries(
                mealTypes.map((m) => [
                  m,
                  (candidateMap[m] || []).map((c) => ({ id: c.id, title: c.title }))
                ])
              )
            }
          },
          user
        }).catch(() => {});
        Object.entries(candidateMap).forEach(([mealType, list]) => {
          const sample = (list || []).slice(0, 3).map(r => `${r.title || 'untitled'} (${r.id})`);
          logMealplan(`  • ${mealType}: ${sample.join(' | ') || 'none'}`);
        });
        const candidateText = this.formatCandidatesForPrompt(candidateMap);
        const mealTimesText = mealTypes
          .map((mt) => `- ${this.capitalize(mt)}: ${userPreferences.mealTimes?.[mt] || this.defaultMealTimes()[mt] || ''}`)
          .join('\n');
        const mealSchemas = mealTypes
          .map((mt) => {
            const time = userPreferences.mealTimes?.[mt] || this.defaultMealTimes()[mt] || '12:00';
            const defaultCalories = mt === 'snack' ? 150 : 300;
            return `            {
              "type": "${mt}",
              "scheduledTime": "${time}",
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
                  "nutrition": {"calories": ${defaultCalories}, "protein": 10, "carbs": 40, "fat": 8, "fiber": 5, "sugar": 10},
                  "tags": [],
                  "difficulty": "easy"
                }
              ],
              "totalNutrition": {"calories": ${defaultCalories}, "protein": 10, "carbs": 40, "fat": 8}
            }`;
          })
          .join(',\n');
        const dayPrompt = `
        Create ONE DAY of meals for date ${dateStr}.

        Diet: ${userPreferences.dietType}
        Goals: ${userPreferences.goals}
        Difficulty preference: ${userPreferences.difficulty || 'any'} (prefer matches; if none, choose the closest sensible option)
        Allergies: ${userPreferences.allergies?.join(', ') || 'None'}
        Disliked Foods: ${userPreferences.dislikedFoods?.join(', ') || 'None'}
        Preferred ingredients (try to use at least ONE when relevant; skip if none fit): ${Array.isArray(userPreferences.includeIngredients) && userPreferences.includeIngredients.length ? userPreferences.includeIngredients.join(', ') : 'None specified'}
        Context: Month ${monthLabel}, Weekday ${weekdayLabel}. Adjust variety accordingly (e.g., lighter on busy weekdays, seasonal feel by month). If you infer current weather from context, reflect it subtly; otherwise ignore.
        Weather snapshot (from open-meteo): ${weatherContext || 'unknown/skip if not useful'}.
        
        Generate ONLY these meals (skip all others): ${mealTypes.join(', ')}.

        Meal Times:
        ${mealTimesText}

        Here are EXISTING recipes you must prefer and pick from (by id and title).
        You MUST select only from these; do not invent ids or titles. If none fits, pick the closest candidate instead of leaving empty.
        ${candidateText}

        IMPORTANT:
        - Do NOT add meal types that are not listed. If a meal type is missing in candidates, return an empty array for its recipes.
        - Prefer non-LLM candidates (ids NOT starting with "llm-") when possible; use LLM-generated fallbacks only if no suitable human/ES candidate fits.
        - For each meal, choose up to TWO distinct candidate ids (primary + alternate) from that meal type only; do NOT invent ids. This system may randomly keep just one of them.
        - Choose candidates that make sense for the meal type (e.g., breakfast should be breakfast foods, not dinner entrées or cleaning products); skip off-theme items and pick the next best food item from the same meal type list.
        - When multiple candidates fit, prefer the one whose difficulty matches: ${userPreferences.difficulty || 'any'} (easy/medium/hard). If none match, choose the closest reasonable difficulty.
        - Rotate preferred ingredients: if includeIngredients has multiple items, try to use different ones across meals so the same preferred ingredient is not reused until others were attempted; only repeat when you have already used or ruled out the rest.
        - Write ALL text (recipe names, descriptions, instructions) in ENGLISH.
        - Prefer the listed existing recipes by id/title; do not invent ids.
        - Return ONLY strict JSON. Do NOT include ellipses, comments, or markdown fences.

        JSON schema to return (fill every field with concrete values):
        {
          "date": "${dateStr}",
          "meals": [
${mealSchemas}
          ]
        }
        `;

        try {
          const tLLMStart = Date.now();
          logMealplan(`🧠 Calling LLM for day ${dayIndex + 1}/${duration}...`);
          const text = await this.callTextModel(dayPrompt, 0.8, 'json');
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
            // Keep only requested meal types
            dayData.meals = (dayData.meals || []).filter((meal) =>
              meal && meal.type && mealTypes.includes(String(meal.type).toLowerCase())
            );
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
            await this.sanityCheckDayPlan(dayData, candidateMap, userPreferences);
            // Drop any meal types that were added back by the checker but are not requested
            dayData.meals = (dayData.meals || []).filter((meal) =>
              meal && meal.type && mealTypes.includes(String(meal.type).toLowerCase())
            );
            // Re-enforce candidates after sanity replacements to ensure times/nutrition/ingredients are grounded
            await this.enforceCandidateRecipes(dayData, candidateMap);
            // Final dedupe after enforcement
            this.dedupeDayRecipes(dayData, recentIds, usedRecipeIds);
            // Track ids for next day dedupe (keep last day’s ids)
            const idsToday = this.collectRecipeIds(dayData);
            recentIds.splice(0, recentIds.length, ...idsToday);
            idsToday.forEach((id) => usedRecipeIds.add(String(id)));
            days.push(dayData);
            imageTasks.push(
              Promise.allSettled((dayData.meals || []).map((meal) => ensureMealImage(meal)))
            );
          } else {
            console.warn(`⚠️ Day ${dayIndex + 1} failed, using fallback`);
            const fallbackDay = fallbackPlan.days[dayIndex];
            days.push(fallbackDay);
            imageTasks.push(
              Promise.allSettled((fallbackDay?.meals || []).map((meal) => ensureMealImage(meal)))
            );
          }
        } catch (dayError) {
          console.error(`❌ Error generating day ${dayIndex + 1}:`, dayError.message);
          const fallbackDay = fallbackPlan.days[dayIndex];
          days.push(fallbackDay);
          imageTasks.push(
            Promise.allSettled((fallbackDay?.meals || []).map((meal) => ensureMealImage(meal)))
          );
        }
      }

      await Promise.allSettled(imageTasks);

      // Generation complete
      logMealplan(`✅ Meal plan generation complete: ${days.length} days`);
      // Ask the LLM for a concise, user-friendly title that reflects meals and preferences
      const sampleMeals = days
        .flatMap((d) => d?.meals || [])
        .slice(0, 8)
        .map((m) => m?.recipes?.[0]?.name || m?.recipes?.[0]?.title || m?.type)
        .filter(Boolean);
      let generatedTitle = `${duration}-Day ${userPreferences.dietType || 'Balanced'} Meal Plan`;
      try {
        const namePrompt = `
        Create a concise, human-friendly title for a ${duration}-day meal plan.
        Consider user preferences and a few meal examples.
        Preferences: ${JSON.stringify(userPreferences || {}, null, 2)}
        Meals: ${sampleMeals.join(' | ')}
        Title rules:
        - Max ~8 words
        - No quotes, no emojis, no numbering
        - Reflect cuisine/diet if possible
        Respond with ONLY the title text.`;
        const nameText = await this.callTextModel(namePrompt, 0.4, 'text');
        if (nameText && typeof nameText === 'string') {
          generatedTitle = nameText
            .replace(/[\r\n]/g, ' ')
            .replace(/^["']|["']$/g, '')
            .trim()
            .slice(0, 120);
          if (!generatedTitle.length) generatedTitle = `${duration}-Day ${userPreferences.dietType || 'Balanced'} Meal Plan`;
        }
      } catch (err) {
        console.warn('⚠️ Meal plan title generation failed, using fallback', err?.message || err);
      }

      return {
        title: generatedTitle,
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

    // Snapshot of LLM-picked meals before we enforce/graft candidates
    logMealplan('🧭 enforceCandidateRecipes start', {
      meals: dayData.meals.length,
      picks: dayData.meals.map((m) => ({
        mealType: m.type,
        llmTitle: m.recipes?.[0]?.name || m.recipes?.[0]?.title || null
      }))
    });

    dayData.meals = dayData.meals.map((meal) => {
      // If LLM returned multiple recipes, pick one of the first two to introduce variety
      const normalizedMeal = (() => {
        const recs = Array.isArray(meal?.recipes) ? meal.recipes : [];
        if (recs.length > 1) {
          const choice = this.shuffle(recs.slice(0, 2))[0];
          return { ...meal, recipes: [choice] };
        }
        return meal;
      })();
      const mealNormalized = normalizedMeal;
      const mealType = (mealNormalized?.type || '').toLowerCase();
      const bucket = candidatesByMeal[mealType];
      if (!bucket || !bucket.list?.length) {
        // No candidates for this meal type: drop non-grounded recipes
        logMealplan(`⚠️ No candidates for meal type "${mealType}", clearing recipes`);
        return { ...mealNormalized, recipes: [] };
      }

      const fixRecipe = (r) => {
        if (r && bucket.map.has(String(r.id))) {
          // Optionally rotate to a different candidate to avoid repetition across runs
          let chosen = bucket.map.get(String(r.id));
          if (bucket.list.length > 1 && Math.random() < 0.35) {
            const alt = this.shuffle(bucket.list).find(
              (c) => c?.id && String(c.id) !== String(chosen.id) && !dayUsedIds.has(String(c.id))
            );
            if (alt) chosen = alt;
          }
          const src = chosen;
          // Always use parsed ingredients_raw to stay grounded
          let ingredients = this.parseIngredientsFromSource(src);
          if (!ingredients.length && Array.isArray(r.ingredients)) {
            ingredients = r.ingredients;
          }
          const extracted = this.extractNutritionFromSource(src);
          const nutrition = this.hasNutritionData(extracted)
            ? extracted
            : (this.hasNutritionData(r.nutrition) ? r.nutrition : this.ensureNutrition(extracted, mealType));
          if (src?.id) dayUsedIds.add(String(src.id));
          const cleanName = this.cleanTitle(src.title || r.name);
          const totalTime = (src.total_time_min ?? src.total_time_minutes) ??
            ((Number(src.prep_time_minutes || src.prepTime || 0) + Number(src.cook_time_minutes || src.cookTime || 0)) || null);
          const prepTime = src.prep_time_minutes ?? src.prepTime ?? r.prepTime ?? 0;
          const cookTime = src.cook_time_minutes ?? src.cookTime ?? r.cookTime ?? 0;
          const normalizedPrep = (prepTime || cookTime) ? prepTime : (totalTime || 0);
          logMealplan('✅ enforceCandidateRecipes: matched', {
            mealType,
            title: cleanName || src.title
          });
          return {
            ...r,
            id: src.id,
            name: cleanName || r.name,
            description: src.description || r.description,
            prepTime: normalizedPrep,
            cookTime,
            total_time_min: totalTime || (normalizedPrep + cookTime) || null,
            ingredients,
            instructions: src.instructions || r?.instructions || [],
            nutrition,
            ai_generated: src.ai_generated || r.ai_generated || false,
            tags: Array.from(new Set([...(Array.isArray(r.tags) ? r.tags : []), ...(Array.isArray(src.tags) ? src.tags : [])]))
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
          : (this.hasNutritionData(r?.nutrition) ? r?.nutrition : this.ensureNutrition(extracted, mealType));
        const cleanName = this.cleanTitle(first?.title || r?.name);
        const totalTime = (first?.total_time_min ?? first?.total_time_minutes) ??
          ((Number(first?.prep_time_minutes || first?.prepTime || 0) + Number(first?.cook_time_minutes || first?.cookTime || 0)) || null);
        const prepTime = first?.prep_time_minutes ?? first?.prepTime ?? r?.prepTime ?? 0;
        const cookTime = first?.cook_time_minutes ?? first?.cookTime ?? r?.cookTime ?? 0;
        const normalizedPrep = (prepTime || cookTime) ? prepTime : (totalTime || 0);
        logMealplan('🔄 enforceCandidateRecipes: replacing', {
          mealType,
          title: cleanName || first?.title
        });
        const base = {
          id: first?.id || null,
          name: cleanName || first?.title || r?.name || 'Recipe',
          description: first?.title || r?.description || '',
          prepTime: normalizedPrep,
          cookTime,
          total_time_min: totalTime || (normalizedPrep + cookTime) || null,
          ai_generated: first?.ai_generated || r?.ai_generated || false,
          tags: Array.from(new Set([...(Array.isArray(r?.tags) ? r.tags : []), ...(Array.isArray(first?.tags) ? first.tags : []), first?.cuisine].filter(Boolean))),
          ingredients,
          instructions: first?.instructions || r?.instructions || [],
          nutrition
        };
        if (first?.id) dayUsedIds.add(String(first.id));
        return { ...r, ...base };
      };

      const recipes = Array.isArray(mealNormalized?.recipes) && mealNormalized.recipes.length
        ? mealNormalized.recipes.map(fixRecipe)
        : [fixRecipe(null)];

      const totalNutrition = this.sumRecipeNutrition(recipes);

      return { ...mealNormalized, recipes, totalNutrition };
    });

    const recipeCount = dayData.meals.reduce((acc, m) => acc + (m.recipes?.length || 0), 0);
    logMealplan(`✅ enforceCandidateRecipes done. Meals=${dayData.meals.length}, recipes=${recipeCount}`, {
      meals: dayData.meals.map((m) => ({
        mealType: m.type,
        title: m.recipes?.[0]?.name || m.recipes?.[0]?.title || null
      }))
    });
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
      const raw = await this.callTextModel(prompt, 0.4, 'json');
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

  /**
   * Generate a single recipe with an exact title using user-provided context.
   */
  async generateExactTitleRecipe(title, mealType = 'dinner', userMessage = '', historyContext = '') {
    const prompt = `
    You are a recipe generator. Create ONE recipe in JSON (no markdown fences) with EXACT title "${title}".
    If the user provided ingredients or steps, respect them. Keep it coherent for a ${mealType}.
    User message/context:
    "${userMessage}"
    Previous assistant context:
    "${historyContext}"

    JSON shape:
    {
      "id": "string",
      "title": "${title}",
      "cuisine": "string",
      "meal_type": ["${mealType}"],
      "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number },
      "ingredients_parsed": [ { "name": "string", "amount": "string", "unit": "string", "category": "protein|vegetable|fruit|grain|dairy|fat|spice|nut|seed|other" } ],
      "instructions": ["Step 1", "Step 2", "..."]
    }
    Keep ingredients 8-14 items max. Provide reasonable macros (>0).
    `;
    try {
      const raw = await this.callTextModel(prompt, 0.35, 'json');
      let body = (raw || '').replace(/```json|```/gi, '').trim();
      const objMatch = body.match(/\{[\s\S]*\}/);
      if (objMatch) body = objMatch[0];
      let parsed = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== 'object') {
        logMealplan('⚠️ Exact title recipe parse failed', { title, preview: body.slice(0, 200) });
        return null;
      }
      parsed.id = parsed.id || `llm-${Date.now()}`;
      parsed.title = title;
      parsed.meal_type = Array.isArray(parsed.meal_type) ? parsed.meal_type : [mealType];
      parsed.nutrition = this.hasNutritionData(parsed.nutrition)
        ? parsed.nutrition
        : this.ensureNutrition(parsed.nutrition || {}, mealType);
      return parsed;
    } catch (err) {
      logMealplan('⚠️ Exact title recipe generation failed:', err.message);
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
      preferred ingredients (use when relevant; skip if they don't fit): ${(preferences.includeIngredients || []).join(', ')}
      Avoid repeating the same preferred ingredient across recipes; if multiple preferred ingredients exist, spread them so each gets used at most once before repeating.
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
      const raw = await this.callTextModel(prompt, 0.4, 'json');
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
      let arr = parseLooseArray(raw);
      if (!Array.isArray(arr)) {
        // Try to salvage a single object from braces
        const objMatch = (raw || '').match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            const parsedObj = JSON.parse(objMatch[0]);
            arr = [parsedObj];
          } catch {
            arr = null;
          }
        }
      }
      if (!Array.isArray(arr)) {
        logMealplan('⚠️ LLM batch returned non-array', { mealType, preview: raw?.slice(0, 200) });
        // Fallback: craft a minimal recipe so callers always get something
        return [{
          id: `llm-${Date.now()}`,
          title: preferences.recipeTitle || `Custom ${mealType} recipe`,
          cuisine: preferences.cuisine || preferences.preferredCuisine || 'any',
          meal_type: [mealType],
          ai_generated: true,
          tags: ['llm-fallback'],
          nutrition: this.ensureNutrition({}, mealType),
          ingredients_parsed: [{ name: 'Ingredient 1', amount: '1', unit: 'unit', category: 'other' }],
          instructions: ['Combine ingredients and cook to taste.']
        }];
      }
      const calorieFloors = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
      const mealCalFloor = calorieFloors[mealType] || 0;
      const mapped = arr
        .map((r) => ({
          ...r,
          id: r.id || `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          meal_type: Array.isArray(r.meal_type) ? r.meal_type : [mealType],
          ai_generated: true,
          tags: Array.from(new Set([...(Array.isArray(r.tags) ? r.tags : []), 'llm-fallback'])),
          nutrition: this.hasNutritionData(r.nutrition)
            ? r.nutrition
            : this.ensureNutrition(r.nutrition || { calories: r.calories, protein: r.protein }, mealType)
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
    const keys = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];
    const populated = keys.filter((k) => Number(n[k]) > 0);
    return populated.length >= 2;
  }

  ensureNutrition(n, mealType = null) {
    const defaults = {
      breakfast: { calories: 400, protein: 20, carbs: 35, fat: 15, fiber: 5, sugar: 10 },
      lunch: { calories: 600, protein: 35, carbs: 50, fat: 20, fiber: 8, sugar: 12 },
      dinner: { calories: 650, protein: 40, carbs: 45, fat: 25, fiber: 8, sugar: 10 },
      snack: { calories: 200, protein: 8, carbs: 20, fat: 8, fiber: 2, sugar: 8 }
    };
    const base = { ...(defaults[mealType] || defaults.lunch) };
    const src = n || {};
    const keys = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];
    keys.forEach((k) => {
      const val = Number(src[k]);
      if (Number.isFinite(val) && val >= 0) {
        base[k] = val;
      }
    });
    return base;
  }

  cleanTitle(title, dietTag = null) {
    if (!title) return title;
    const dietWords = [
      'keto',
      'paleo',
      'low carb',
      'low-carb',
      'vegan',
      'vegetarian',
      'gluten free',
      'gluten-free',
      'whole30',
      'weight loss',
      'weight-loss',
      'mediterranean'
    ];
    let cleaned = title;
    const pattern = new RegExp(
      `^\\s*[\\[\\(]?\\s*(?:${dietWords.join('|')})\\s*[\\]\\)]?\\s*[:\\-–—]*\\s*`,
      'i'
    );
    // Strip up to two leading diet labels to be safe
    for (let i = 0; i < 2; i += 1) {
      const next = cleaned.replace(pattern, '').trim();
      if (next === cleaned) break;
      cleaned = next;
    }
    return cleaned || title;
  }

  /**
   * Ask LLM to sanity-check a day's meals and suggest replacements by candidate id.
   */
  async sanityCheckDayPlan(dayData, candidateMap, preferences = {}) {
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
      - Avoid repeated proteins in the same day; try to diversify main protein sources across meals (e.g., don't use chicken in lunch and dinner).
      - Avoid repeated proteins for breakfast (prefer traditional breakfast foods); keep lunch/dinner savory mains.
      - Prefer meals with protein > 0 and sensible calories (skip obvious near-zero calorie meals).
      - Keep meal type coherent: breakfast should be breakfast-like; dinner should not be sweets-only.
      - Prefer candidates that include user preferred ingredients when available; if none fit, skip them: ${(preferences?.includeIngredients || []).join(', ')}
      - If multiple preferred ingredients are provided, spread them across meals and avoid reusing the same preferred ingredient until others have been used or clearly do not fit.
      - Prefer recipes whose difficulty matches the user preference (${preferences?.difficulty || 'any'}). If none match, choose the closest reasonable difficulty.
      - If a meal looks off-theme, propose a replacement id from the SAME meal type candidates.
      Return ONLY JSON: {"replacements":[{"type":"breakfast","replaceWithId":"candidate-id-or-null"}, ...]}
      Meals: ${JSON.stringify(summary)}
      Candidates: ${JSON.stringify(candidatesByType)}
      `;
      const raw = await this.callTextModel(prompt, 0.3, 'json');
      const cleaned = raw.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed?.replacements) return;
      // If no replacements suggested but duplicate proteins found, enforce a fallback replacement using candidates
      const hasDupProtein = (() => {
        const proteins = (summary || [])
          .map((m) => (m.title || '').toLowerCase())
          .filter(Boolean);
        const seen = new Set();
        for (const p of proteins) {
          if (seen.has(p)) return true;
          seen.add(p);
        }
        return false;
      })();
      if (!parsed.replacements.length && hasDupProtein) {
        // Try to pick an alternative for the last meal using a different protein source
        const lastMeal = summary[summary.length - 1];
        if (lastMeal?.type) {
          const typeKey = lastMeal.type.toLowerCase();
          const bucket = candidateMap?.[typeKey] || [];
          const currentTitle = (lastMeal.title || '').toLowerCase();
          const alt = bucket.find(
            (c) => (c.title || '').toLowerCase() !== currentTitle
          );
          if (alt) {
            parsed.replacements.push({ type: typeKey, replaceWithId: alt.id });
          }
        }
      }
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
    addNumber('calories', nSrc.calories, src.calories);
    addNumber('protein', nSrc.protein_g, nSrc.protein, src.protein_grams, src.protein_g, src.protein);
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

  async detectRecipeSearchIntent(message) {
    try {
      const prompt = `
      Decide the user's intent. Return ONLY JSON with:
      {
        "intent": "recipe_search" | "recipe_detail" | "shopping_list" | "chat",
        "diet": "<diet tag like vegetarian|vegan|keto|balanced|null>",
        "includeIngredients": [strings],
        "excludeIngredients": [strings],
        "cuisine": "<string|null>",
        "quick": true|false,
        "recipeId": "<id if user mentions a specific recipe id or code, else null>",
        "recipeTitle": "<title if user asks about a specific recipe by name, else null>",
        "listTitle": "<shopping list title if intent=shopping_list, else null>",
        "items": [
          { "name": "string", "quantity": "string" }
        ]
      }
      If unsure, set intent to "chat".
      Message: """${message}"""
      `;
      const text = await this.callTextModel(prompt, 0);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      return null;
    }
  }

  async chatWithDietitian(message, conversationHistory = [], activeMealPlan = null, user = null, mealPlanHistory = []) {
    try {
      const msgLower = (message || '').toLowerCase();
      // Let the LLM classify intent; if it's a recipe search, route to ES results.
      const intent = await this.detectRecipeSearchIntent(message);
      // Heuristic: if user references "first/second/third" without an id/title, try to pull from last assistant list
      if (intent?.intent === 'recipe_detail' && !intent.recipeId && !intent.recipeTitle) {
        const lastAssistant = [...conversationHistory].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant?.content) {
          const titles = [];
          lastAssistant.content.split('\n').forEach((line) => {
            const mNum = line.match(/^\s*\d+\)\s*([^–-]+)/);
            if (mNum && mNum[1]) titles.push(mNum[1].trim());
          });
          const ordinals = {
            first: 0, 1: 0,
            second: 1, 2: 1,
            third: 2, 3: 2,
            fourth: 3, 4: 3,
            fifth: 4, 5: 4
          };
          const lowered = message.toLowerCase();
          const idx = Object.keys(ordinals).find((k) => lowered.includes(k));
          if (idx !== undefined && titles[ordinals[idx]] !== undefined) {
            intent.recipeTitle = titles[ordinals[idx]];
          }
        }
      }
      // Shopping list intent: return structured payload to frontend
      if (intent?.intent === 'shopping_list') {
        return {
          type: 'shopping_list',
          title: intent.listTitle || 'Shopping List',
          items: Array.isArray(intent.items) ? intent.items : [],
          message: 'Got it, let\'s add these items to your shopping list.'
        };
      }

      // Quick path: user explicitly asks for today's meals
      const wantsTodayMeals = /today('s)? meal|meals today|what.*today.*meal/i.test(msgLower);
      if (wantsTodayMeals) {
        const today = new Date();
        // Prefer active plans only; if none, fall back to most recent plan
        const historyArr = Array.isArray(mealPlanHistory) ? mealPlanHistory : [];
        const activePlans = [
          ...(activeMealPlan ? [activeMealPlan] : []),
          ...historyArr.filter((p) => p && p.status === 'active')
        ].filter(Boolean);
        const allPlans = activePlans.length ? activePlans : [...(activeMealPlan ? [activeMealPlan] : []), ...historyArr].filter(Boolean);
        const allDays = allPlans.flatMap((p) =>
          (p.days || []).map((d) => ({ ...d, planTitle: p.title || 'Meal Plan' }))
        );
        const withDate = allDays
          .map((d) => ({ ...d, dateObj: d.date ? new Date(d.date) : null }))
          .filter((d) => d.dateObj && !isNaN(d.dateObj.getTime()));

        // Helper to detect "today" within a small tolerance to avoid TZ off-by-one
        const isToday = (d) => {
          const diff = Math.abs(d.dateObj.getTime() - today.getTime());
          if (diff < 12 * 60 * 60 * 1000) return true; // within 12h
          return d.dateObj.toDateString() === today.toDateString();
        };

        let targetDay = withDate.find(isToday);
        if (!targetDay && withDate.length) {
          // Pick the closest date overall (future or past)
          targetDay = withDate
            .map((d) => ({ ...d, diff: Math.abs(d.dateObj.getTime() - today.getTime()) }))
            .sort((a, b) => a.diff - b.diff)[0];
        }
        if (targetDay) {
          const lines = (targetDay.meals || []).map((meal, idx) => {
            const recipe = meal.recipes?.[0] || {};
            const title = recipe.name || recipe.title || meal.type || `Meal ${idx + 1}`;
            const type = meal.type || recipe.meal_type || '';
            const cal = recipe.nutrition?.calories ?? recipe.calories ?? recipe.total_calories;
            const time = meal.scheduledTime || recipe.time || '';
            const macro = cal ? `${cal} cal` : '';
            const when = type ? type : '';
            const meta = [when, macro, time].filter(Boolean).join(' • ');
            return `- <recipe>${title}</recipe>${meta ? ` — ${meta}` : ''}`;
          });
          const dayLabel = targetDay.dateObj.toLocaleDateString();
          if (!lines.length) {
            lines.push('- No meals found for this day.');
          }
          return [`Here are your meals for ${dayLabel} 🍽️`, ...lines].join('\n');
        }
        // No matching day found
        return `I couldn't find meals scheduled for today (${today.toLocaleDateString()}). If you have another active plan, please activate it first.`;
      }

      if (intent?.intent === 'recipe_search') {
        const stripEmoji = (value = '') =>
          String(value || '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
            .replace(/[\u{FE0F}\u{200D}]/g, '')
            .trim();
        const buildRecipeSuggestionMessage = (recipes = [], introText = '') => {
          const safeIntro = String(introText || '').trim();
          const list = (recipes || []).map((r, idx) => {
            const titleRaw = r.title || r.name || `Recipe ${idx + 1}`;
            const title = stripEmoji(titleRaw);
            const calories = r.nutrition?.calories ?? r.calories ?? null;
            const protein = r.nutrition?.protein ?? r.protein ?? r.protein_grams ?? r.protein_g ?? null;
            const time = r.total_time_min ?? r.total_time_minutes ?? r.prep_time_minutes ?? null;
            const parts = [];
            if (calories !== null && calories !== undefined) parts.push(`${calories} cal`);
            if (protein !== null && protein !== undefined) parts.push(`${protein}g protein`);
            if (time !== null && time !== undefined) parts.push(`${time} min`);
            const meta = parts.length ? ` — ${parts.join(', ')}` : '';
            return `<recipe>${title}</recipe>${meta}`;
          }).join('\n');
          if (!safeIntro) return list;
          return list ? `${safeIntro}\n\n${list}` : safeIntro;
        };

        const searchText = await summarizeSearchText(message, intent, conversationHistory);
        const vectorInput = intent.recipeTitle || searchText;
        const queryVector = await buildQueryVector(vectorInput);
        const cleanVal = (v) => (v && String(v).toLowerCase() !== 'null' ? v : null);
        const cleanList = (arr = []) =>
          (Array.isArray(arr) ? arr : [arr])
            .map((v) => (typeof v === 'string' ? v.toLowerCase().trim() : v))
            .filter((v) => v && v !== 'null');
        const filters = {
          text: searchText,
          diet_tags: cleanList(intent.diet ? [intent.diet] : []),
          include_ingredients: cleanList(intent.includeIngredients || []),
          exclude_ingredients: cleanList(intent.excludeIngredients || []),
          cuisine: cleanVal(intent.cuisine),
          quick: intent.quick === true
        };
        if (queryVector) {
          filters.query_vector = queryVector;
        }
        const { results } = await searchRecipes(filters, { size: 5, logSearch: LOG_SEARCH || LOG_MEALPLAN });
        const keyword = intent.recipeTitle ? intent.recipeTitle.toLowerCase().trim() : '';
        const filtered = keyword
          ? (results || []).filter((r) => (r.title || '').toLowerCase().includes(keyword))
          : results || [];
        let useResults = filtered.length ? filtered : results;
        if (LOG_SEARCH || LOG_MEALPLAN) {
          console.log('🔎 chatbot recipe_search raw results', {
            keyword,
            total: results?.length || 0,
            filtered: filtered?.length || 0,
            sample: (results || []).slice(0, 3).map((r) => r.title || r.name)
          });
        }

        const shouldForceLLM = keyword && !filtered.length;
        // If results are sparse or irrelevant, backfill with LLM-generated recipes
        if (shouldForceLLM || !useResults?.length || useResults.length < 2) {
          const inferredMealType =
            intent.mealType ||
            (keyword.includes('dessert') ? 'dessert' : intent.intent || 'dinner');
          const fallback = await this.generateLLMFallbackRecipes(
            inferredMealType,
            { preferredCuisine: intent.cuisine || null, dietType: intent.diet || null, recipeTitle: keyword },
            3
          );
          if (fallback?.length) {
            useResults = (useResults || []).concat(fallback);
            if (LOG_SEARCH || LOG_MEALPLAN) {
              console.log('✨ chatbot recipe_search falling back to LLM', {
                reason: shouldForceLLM ? 'keyword_no_match' : 'low_count',
                fallbackCount: fallback.length
              });
            }
          }
        }
        if (!useResults?.length) {
          return 'I could not find matching recipes right now. Try adjusting the ingredients or diet.';
        }

        // Ask LLM to discard irrelevant candidates based on user intent
        try {
          const candidateData = useResults.map((r, idx) => ({
            id: r.id || r._id || `c${idx}`,
            title: r.title || r.name,
            calories: r.nutrition?.calories ?? r.calories,
            protein: r.nutrition?.protein ?? r.protein ?? r.protein_grams ?? r.protein_g,
            time: r.total_time_min ?? r.total_time_minutes ?? r.prep_time_minutes
          }));
          const filterPrompt = `
          User asked: "${message}"
          You have candidate recipes (JSON):
          ${JSON.stringify(candidateData, null, 2)}

          Decide which candidates respect the user request (ingredients, meal type, etc.).
          Respond with ONLY JSON: {"keepIds":["id1","id2"...]} using the ids provided above.
          If unsure, keep all. Do NOT invent new ids or recipes.
          `;
          const filterResp = await this.callTextModel(filterPrompt, 0.2, 'json');
          const parsedFilter = (() => {
            try {
              const cleaned = (filterResp || '').replace(/```json|```/gi, '').trim();
              return JSON.parse(cleaned);
            } catch {
              return null;
            }
          })();
          const keepIds = Array.isArray(parsedFilter?.keepIds)
            ? parsedFilter.keepIds.map((v) => String(v))
            : null;
          if (keepIds && keepIds.length) {
            useResults = useResults.filter((r, idx) => {
            const id = r.id || r._id || `c${idx}`;
            return keepIds.includes(String(id));
          });
        }
        if (!useResults.length) {
            useResults = candidateData.map((c, idx) => useResults[idx]).filter(Boolean); // fallback to original
          }
        } catch (filterErr) {
          console.warn("⚠️ LLM candidate filter failed", filterErr?.message || filterErr);
        }
        const introLine = 'Here are a few recipes that match your request:';
        const summary = buildRecipeSuggestionMessage(useResults, introLine);

        // Ask the LLM to validate/refresh the list to match the request (and invent if none match)
        try {
          const recPrompt = `
          User asked: "${message}"
          You have candidate recipes (JSON):
          ${JSON.stringify(useResults.map((r) => ({
            title: r.title || r.name,
            calories: r.nutrition?.calories ?? r.calories,
            protein: r.nutrition?.protein ?? r.protein ?? r.protein_grams ?? r.protein_g,
            time: r.total_time_min ?? r.total_time_minutes ?? r.prep_time_minutes
          })), null, 2)}

          Task: Return a concise plain-text reply with up to 3 recipes that truly match the request.
          Each line MUST start with "- " and follow this exact pattern:
          - <recipe><title></recipe> — <cal> cal, <protein>g protein, <time> min
          If none of the candidates match, invent up to 3 reasonable recipes that do (and still wrap titles in <recipe> tags).
          Do NOT include ids or JSON. Keep it readable with line breaks or bullet points.
          `;
          const llmAnswer = await this.callTextModel(recPrompt, 0.3, 'text');
          const hasRecipeTag = /<recipe>.*<\/recipe>/i.test(llmAnswer || '');
          const normalized = normalizeRecipeListText(llmAnswer);
          return llmAnswer && hasRecipeTag ? normalized : summary;
        } catch (e) {
          return summary;
        }
      }
      if (intent?.intent === 'recipe_detail') {
        let recipe = null;
        // Try to propagate previous assistant list into the search context
        const lastAssistant = [...conversationHistory].reverse().find((m) => m.role === 'assistant')?.content || '';

        if (intent.recipeId) {
          recipe = await getRecipeById(intent.recipeId);
        }
        if (!recipe && intent.recipeTitle) {
          // Prefer exact title match only (no fuzzy)
          const exact = await searchRecipes({ title_exact: intent.recipeTitle }, { size: 1, logSearch: LOG_SEARCH || LOG_MEALPLAN });
          recipe = exact?.results?.[0] || null;
        }
        if (!recipe) {
          // Invent a recipe via dedicated exact-title generator using user context
          const fallbackTitle = intent.recipeTitle || message || 'Custom Recipe';
          let fallback = null;
          try {
            fallback = await this.generateExactTitleRecipe(
              fallbackTitle,
              intent.mealType || 'dinner',
              message,
              lastAssistant
            );
            if (fallback) {
              console.log("ℹ️ Exact-title recipe generated", { title: fallbackTitle });
            }
          } catch (genErr) {
            console.warn("⚠️ Exact-title recipe generation failed", genErr?.message || genErr);
          }
          if (fallback) {
            recipe = { ...fallback, _id: null, source: 'ai' };
          } else {
            console.log("ℹ️ Using minimal placeholder recipe", { title: fallbackTitle });
            // as a last resort, construct a minimal recipe to avoid empty reply
            recipe = {
              _id: null,
              source: 'ai',
              title: fallbackTitle,
              ingredients: ['1 item of your choice'],
              instructions: ['Combine ingredients and cook to taste.']
            };
          }
        }
        const calories = recipe.nutrition?.calories ?? recipe.calories ?? 'n/a';
        const protein = recipe.nutrition?.protein ?? recipe.protein ?? recipe.protein_grams ?? recipe.protein_g ?? 'n/a';
        const carbs = recipe.nutrition?.carbs ?? recipe.carbs ?? recipe.carbs_g ?? recipe.carbs_grams ?? 'n/a';
        const fat = recipe.nutrition?.fat ?? recipe.fat ?? recipe.fat_g ?? recipe.fat_grams ?? 'n/a';
        const time = recipe.total_time_min ?? recipe.total_time_minutes ?? recipe.prep_time_minutes ?? recipe.cook_time ?? 'n/a';
        const ingList = Array.isArray(recipe.ingredients_parsed)
          ? recipe.ingredients_parsed.map((i) => `${i.amount || ''} ${i.unit || ''} ${i.name || ''}`.trim()).filter(Boolean)
          : Array.isArray(recipe.ingredients)
            ? recipe.ingredients.map((i) => (typeof i === 'string' ? i : `${i.amount || ''} ${i.unit || ''} ${i.name || ''}`.trim())).filter(Boolean)
            : (typeof recipe.ingredients_raw === 'string' ? recipe.ingredients_raw.split('\n').filter(Boolean) : []);
        const instructionsList = Array.isArray(recipe.instructions)
          ? recipe.instructions
          : (typeof recipe.instructions === 'string' ? recipe.instructions.split('\n').filter(Boolean) : []);

        const detail = {
          type: 'recipe_detail',
          title: recipe.title || recipe.name || intent.recipeTitle || 'Recipe',
          source: recipe._id ? 'db' : (recipe.source || 'ai'),
          id: recipe._id || recipe.id || null,
          imageUrl: recipe.imageUrl || recipe.image || recipe.photo || null,
          ingredients: ingList,
          instructions: instructionsList,
          nutrition: { calories, protein, carbs, fat, time }
        };

        return JSON.stringify(detail);
      }

      // Decide if we should inject meal plan context (only when user intent seems plan/recipe related)
      const includePlanContext =
        (intent && ['recipe_search', 'recipe_detail'].includes(intent.intent)) ||
        /(meal plan|today's meal|today meal|day\s+\d|swap|breakfast|lunch|dinner|snack)/i.test(msgLower);

      // Build meal plan context if available and desired
      let mealPlanContext = '';
      const todayStr = new Date().toLocaleDateString();
      if (includePlanContext && activeMealPlan && activeMealPlan.days && activeMealPlan.days.length > 0) {
        mealPlanContext = `\n\n**USER'S ACTIVE MEAL PLAN CONTEXT (today: ${todayStr}):**
        
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
      }

      // Add a compact history of recent meal plans (active + past) for reference
      if (includePlanContext && Array.isArray(mealPlanHistory) && mealPlanHistory.length) {
        const historyLines = mealPlanHistory.slice(0, 12).map((mp) => {
          const start = mp.startDate ? new Date(mp.startDate).toLocaleDateString() : 'N/A';
          const end = mp.endDate ? new Date(mp.endDate).toLocaleDateString() : 'N/A';
          return `- ${mp.title || 'Meal Plan'} (${mp.status || 'unknown'}) • ${start} → ${end}`;
        }).join('\n');
        mealPlanContext += `\n\n**RECENT MEAL PLANS:**\n${historyLines}`;
      }

      // Add a brief snapshot of recent meals across active/history plans (helps answer "today" even between plans)
      if (includePlanContext) {
        const allPlans = [
          ...(activeMealPlan ? [activeMealPlan] : []),
          ...(Array.isArray(mealPlanHistory) ? mealPlanHistory : [])
        ].filter(Boolean);
        const daysWithMeals = allPlans.flatMap((p) =>
          (p.days || []).map((d) => ({
            planTitle: p.title || 'Meal Plan',
            dateObj: d.date ? new Date(d.date) : null,
            meals: d.meals || []
          }))
        );
        const datedDays = daysWithMeals
          .filter((d) => d.dateObj && !isNaN(d.dateObj.getTime()))
          .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime())
          .slice(0, 14);
        if (datedDays.length) {
          const mealLines = datedDays
            .map((d) => {
              const mealsLine = (d.meals || [])
                .map((meal) => {
                  const recipe = meal.recipes?.[0] || {};
                  const title = recipe.name || recipe.title || meal.type || 'Meal';
                  const type = meal.type || recipe.meal_type || '';
                  return `${type ? `${type}: ` : ''}${title}`;
                })
                .join(' | ');
              return `${d.dateObj.toLocaleDateString()} • ${d.planTitle} — ${mealsLine || 'No meals'}`;
            })
            .join('\n');
          mealPlanContext += `\n\n**RECENT MEALS SNAPSHOT (last 14 days):**\n${mealLines}`;
        }
      }

      // Add a compact "today" context with macros (closest dated day, preferring active plans)
      if (includePlanContext) {
        const allPlans = [
          ...(activeMealPlan ? [activeMealPlan] : []),
          ...(Array.isArray(mealPlanHistory) ? mealPlanHistory : [])
        ].filter(Boolean);
        const daysWithDate = allPlans.flatMap((p) =>
          (p.days || []).map((d) => ({
            planTitle: p.title || 'Meal Plan',
            dateObj: d.date ? new Date(d.date) : null,
            meals: d.meals || []
          }))
        ).filter((d) => d.dateObj && !isNaN(d.dateObj.getTime()));

        if (daysWithDate.length) {
          const today = new Date();
          const isToday = (d) => {
            const diff = Math.abs(d.dateObj.getTime() - today.getTime());
            if (diff < 12 * 60 * 60 * 1000) return true;
            return d.dateObj.toDateString() === today.toDateString();
          };
          let targetDay = daysWithDate.find(isToday);
          if (!targetDay) {
            targetDay = daysWithDate
              .map((d) => ({ ...d, diff: Math.abs(d.dateObj.getTime() - today.getTime()) }))
              .sort((a, b) => a.diff - b.diff)[0];
          }
          if (targetDay) {
            const mealLines = (targetDay.meals || []).map((meal, idx) => {
              const recipe = meal.recipes?.[0] || {};
              const title = recipe.name || recipe.title || meal.type || `Meal ${idx + 1}`;
              const type = meal.type || recipe.meal_type || '';
              const cal = recipe.nutrition?.calories ?? meal.totalNutrition?.calories ?? recipe.calories ?? meal.calories;
              const protein = recipe.nutrition?.protein ?? meal.totalNutrition?.protein ?? recipe.protein;
              const carbs = recipe.nutrition?.carbs ?? meal.totalNutrition?.carbs ?? recipe.carbs;
              const fat = recipe.nutrition?.fat ?? meal.totalNutrition?.fat ?? recipe.fat;
              const time = meal.scheduledTime || recipe.time || '';
              const metaParts = [];
              if (type) metaParts.push(type);
              if (cal) metaParts.push(`${cal} cal`);
              if (protein) metaParts.push(`${protein}g protein`);
              if (carbs) metaParts.push(`${carbs}g carbs`);
              if (fat) metaParts.push(`${fat}g fat`);
              if (time) metaParts.push(time);
              return `- <recipe>${title}</recipe>${metaParts.length ? ` — ${metaParts.join(' • ')}` : ''}`;
            });

            const totals = targetDay.meals.reduce(
              (acc, meal) => {
                const n = meal.totalNutrition || meal.recipes?.[0]?.nutrition || {};
                const add = (k) => {
                  const v = Number(n[k]);
                  if (Number.isFinite(v)) acc[k] += v;
                };
                add('calories'); add('protein'); add('carbs'); add('fat');
                return acc;
              },
              { calories: 0, protein: 0, carbs: 0, fat: 0 }
            );

            const totalsLine =
              totals.calories || totals.protein || totals.carbs || totals.fat
                ? `Total: ${totals.calories || 0} cal • ${totals.protein || 0}g protein • ${totals.carbs || 0}g carbs • ${totals.fat || 0}g fat`
                : '';

            if (mealLines.length || totalsLine) {
              mealPlanContext += `\n\n**TODAY'S MEALS (closest dated plan): ${targetDay.dateObj.toLocaleDateString()}**\n${mealLines.join('\n')}${totalsLine ? `\n${totalsLine}` : ''}`;
            }
          }
        }
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
        - Include at least one friendly emoji in each reply to keep the tone warm, BUT never place emojis inside recipe titles or recipe list lines. Prefer adding the emoji at the end of the overall reply or in a short closing sentence.
        - When listing recipes, keep each item on its own line, starting with a dash (-) or a number (1., 2., 3.) followed by the title wrapped in <recipe> tags, then a dash and the macros/time.
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
      let normalizedForList = await this.normalizeIngredientsWithModel(extractedIngredients);
      if (!Array.isArray(normalizedForList) || normalizedForList.length !== extractedIngredients.length) {
        normalizedForList = extractedIngredients;
      }
      const isGroundBeef = (name = '') => /ground\s+beef/i.test(String(name || ''));
      const logGroundBeefItems = (stage, items) => {
        const matches = (items || []).filter((item) => isGroundBeef(item?.name));
        if (!matches.length) return;
        console.log(`🧪 Ground beef [${stage}]:`, matches);
      };
      logGroundBeefItems('extracted', extractedIngredients);
      logGroundBeefItems('normalized', normalizedForList);
      const namesOverlap = (a = '', b = '') => {
        const tokens = (value) =>
          String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((t) => t.length > 2);
        const aTokens = new Set(tokens(a));
        const bTokens = tokens(b);
        return bTokens.some((t) => aTokens.has(t));
      };
      const normalizedSafe = normalizedForList.map((item, idx) => {
        const orig = extractedIngredients[idx];
        if (!orig) return item;
        const safeName = item?.name && namesOverlap(item.name, orig.name) ? item.name : orig.name;
        return {
          ...item,
          name: safeName,
          amount: orig.amount,
          unit: orig.unit,
          category: item?.category || orig.category
        };
      });
      logGroundBeefItems('normalizedSafe', normalizedSafe);
      // File logging disabled to avoid nodemon restarts on log file changes.

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

      const normalizeName = (name = '') => {
        const raw = String(name || '').trim();
        if (!raw) return raw;
        const parts = raw.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
        return parts.length ? parts[0] : raw;
      };

      const canonicalizeName = (name = '') => {
        const base = String(name || '')
          .toLowerCase()
          .replace(/\([^)]*\)/g, '')
          .replace(/\b\d+\s*%/g, '')
          .replace(/\b\d+\s*\/\s*\d+\b/g, '')
          .replace(/[-,]/g, ' ')
          .trim();
        if (!base) return '';
        const tokens = base.split(/\s+/).filter(Boolean);
        const drop = new Set([
          'lean', 'extra', 'fat', 'low', 'reduced', 'organic', 'grass', 'fed',
          'boneless', 'skinless', 'fresh', 'chopped', 'diced', 'sliced'
        ]);
        const cleaned = tokens.filter((t) => !drop.has(t)).join(' ');
        if (/(seasoning|mix|spice)/.test(cleaned) && /hamburger/.test(cleaned)) return cleaned;
        if (/(ground|minced)\s+beef|hamburger/.test(cleaned)) return 'ground beef';
        if (/beef\s+mince|minced\s+beef/.test(cleaned)) return 'ground beef';
        if (/beef\s+ground/.test(cleaned)) return 'ground beef';
        if (/^beef\s+ground$/.test(cleaned)) return 'ground beef';
        if (/chinese\s+tofu/.test(cleaned)) return 'tofu';
        if (/^tofu$/.test(cleaned)) return 'tofu';
        return cleaned.replace(/\s+/g, ' ').trim();
      };

      const isWater = (name = '') => {
        const n = String(name || '').toLowerCase();
        return n === 'water' || n.endsWith(' water') || n.startsWith('water ');
      };

      const normalizeUnitAmount = (ing) => {
        let unitRaw = String(ing.unit || '').toLowerCase().trim();
        let amountRaw = String(ing.amount || '').trim();
        const extractUnitFromAmount = (amountText, unitText) => {
          if (!amountText) return { amountText, unitText };
          if (unitText && unitText !== 'unit') return { amountText, unitText };
          const lower = amountText.toLowerCase();
          const unitMatch = lower.match(/\b(kg|kilogram|kilograms|g|gram|grams|lb|lbs|pound|pounds|oz|ounce|ounces|ml|milliliter|milliliters|millilitre|millilitres|l|liter|liters|litre|litres|cup|cups|c|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons)\b/);
          if (!unitMatch) return { amountText, unitText };
          const nextUnit = unitMatch[1];
          const nextAmount = lower.replace(unitMatch[0], '').trim();
          return { amountText: nextAmount, unitText: nextUnit };
        };
        const extracted = extractUnitFromAmount(amountRaw, unitRaw);
        amountRaw = extracted.amountText;
        unitRaw = extracted.unitText;
        const parseSingle = (val) => {
          const raw = String(val || '').trim();
          if (!raw) return null;
          const wordMap = {
            half: 0.5,
            halves: 0.5,
            quarter: 0.25,
            quarters: 0.25,
            whole: 1
          };
          const lowered = raw.toLowerCase();
          if (Object.prototype.hasOwnProperty.call(wordMap, lowered)) {
            return wordMap[lowered];
          }
          const unicodeFractions = {
            '¼': '1/4',
            '½': '1/2',
            '¾': '3/4',
            '⅓': '1/3',
            '⅔': '2/3'
          };
          const normalized = raw.replace(/[¼½¾⅓⅔]/g, (m) => unicodeFractions[m] || m);
          const mixedMatch = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
          if (mixedMatch) {
            const whole = Number(mixedMatch[1]);
            const num = Number(mixedMatch[2]);
            const den = Number(mixedMatch[3]);
            if (den) return whole + num / den;
          }
          const fracMatch = normalized.match(/^(\d+)\/(\d+)$/);
          if (fracMatch) {
            const num = Number(fracMatch[1]);
            const den = Number(fracMatch[2]);
            if (den) return num / den;
          }
          const num = Number(normalized.replace(/[^0-9.]/g, ''));
          return Number.isFinite(num) ? num : null;
        };
        const parseNum = (val) => {
          const raw = String(val || '').trim();
          if (!raw) return null;
          const rangeParts = raw.split(/\s*(?:-|to)\s*/i);
          if (rangeParts.length > 1) {
            return parseSingle(rangeParts[0]);
          }
          return parseSingle(raw);
        };
        const amountNum = parseNum(amountRaw);
        if (amountNum === null) return ing;
        const cat = String(ing.category || '').toLowerCase();
        const logTransform = (next) => {
          if (!isGroundBeef(ing.name)) return next;
          console.log('🧪 Ground beef [normalizeUnitAmount]', {
            from: { name: ing.name, amount: ing.amount, unit: ing.unit, category: ing.category },
            to: { name: next.name, amount: next.amount, unit: next.unit, category: next.category }
          });
          return next;
        };
        if (['half', 'halves', 'quarter', 'quarters'].includes(unitRaw)) {
          const unitFactor = unitRaw.startsWith('half') ? 0.5 : 0.25;
          return logTransform({
            ...ing,
            amount: String(amountNum * unitFactor),
            unit: 'unit'
          });
        }
        if (unitRaw === 'whole') {
          return logTransform({
            ...ing,
            amount: String(amountNum),
            unit: 'unit'
          });
        }
        if ((unitRaw === 'unit' || unitRaw === '') && amountNum >= 50 && ['protein', 'meat', 'produce', 'vegetable', 'fruit', 'dairy'].includes(cat)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum)), unit: 'g' });
        }
        if (['cup', 'cups', 'c'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 240)), unit: 'ml' });
        }
        if (['tbsp', 'tablespoon', 'tablespoons'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 15)), unit: 'ml' });
        }
        if (['tsp', 'teaspoon', 'teaspoons'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 5)), unit: 'ml' });
        }
        if (['kg', 'kilogram', 'kilograms'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 1000)), unit: 'g' });
        }
        if (['g', 'gram', 'grams'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum)), unit: 'g' });
        }
        if (['lb', 'lbs', 'pound', 'pounds'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 453.592)), unit: 'g' });
        }
        if (['oz', 'ounce', 'ounces'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 28.3495)), unit: 'g' });
        }
        if (['l', 'liter', 'liters', 'litre', 'litres'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum * 1000)), unit: 'ml' });
        }
        if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(unitRaw)) {
          return logTransform({ ...ing, amount: String(Math.round(amountNum)), unit: 'ml' });
        }
        return { ...ing, unit: unitRaw };
      };

      let cleaned = filterGeneric(normalizedSafe)
        .map((ing) => ({
          ...ing,
          name: normalizeName(ing.name)
        }))
        .filter((ing) => !isWater(ing.name));
      if (!cleaned.length) {
        cleaned = filterGeneric(extractedIngredients)
          .map((ing) => ({
            ...ing,
            name: normalizeName(ing.name)
          }))
          .filter((ing) => !isWater(ing.name));
      }

      cleaned = cleaned
        .map((ing) => ({
          ...ing,
          name: (canonicalizeName(ing.name) || ing.name || '').trim(),
          unit: String(ing.unit || '').trim()
        }))
        .map(normalizeUnitAmount);
      logGroundBeefItems('cleaned', cleaned);

      cleaned = await this.convertVolumeToWeightWithModel(cleaned);
      logGroundBeefItems('volumeConverted', cleaned);

      const consolidatedIngredients = this.consolidateIngredients(cleaned);
      logGroundBeefItems('consolidated', consolidatedIngredients);
      return this.buildFallbackShoppingList(consolidatedIngredients, mealPlan);
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

    const allowedCategories = new Set(['protein', 'vegetable', 'fruit', 'grain', 'dairy', 'fat', 'spice', 'nut', 'seed', 'broth', 'herb', 'other']);
    let category = String(categoryCandidate || 'other').trim().toLowerCase() || 'other';
    if (!allowedCategories.has(category)) {
      // Map common out-of-enum values to nearest bucket, else other
      if (['sweetener', 'sugar', 'honey', 'syrup'].includes(category)) category = 'other';
      else if (['legume', 'beans', 'lentils'].includes(category)) category = 'protein';
      else category = 'other';
    }

    const normalised = {
      name: String(nameCandidate).trim(),
      amount: String(amountCandidate || '1').trim() || '1',
      unit: String(unitCandidate || 'unit').trim() || 'unit',
      category
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
    const toShoppingCategory = (cat) => {
      const c = String(cat || '').toLowerCase();
      if (['vegetable', 'fruit', 'produce', 'herb'].includes(c)) return 'produce';
      if (['protein', 'meat'].includes(c)) return 'meat';
      if (['dairy'].includes(c)) return 'dairy';
      if (['grain', 'fat', 'spice', 'nut', 'seed', 'broth', 'pantry'].includes(c)) return 'pantry';
      if (['frozen', 'bakery', 'beverages'].includes(c)) return c;
      return 'other';
    };

    const items = consolidatedIngredients.map(item => {
      const category = toShoppingCategory(item.category);
      const fallbackItem = {
        name: item.name,
        amount: item.amount || '1',
        unit: item.unit || 'unit',
        category,
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

    const mergeKey = (item) =>
      `${String(item.name || '').toLowerCase().trim()}__${String(item.unit || 'unit').toLowerCase().trim()}`;
    const merged = {};
    const toNum = (val) => {
      const num = Number(String(val || '').replace(/[^0-9.]/g, ''));
      return Number.isFinite(num) ? num : null;
    };
    estimatedItems.forEach((item) => {
      const key = mergeKey(item);
      if (!merged[key]) {
        merged[key] = { ...item };
        return;
      }
      const a = toNum(merged[key].amount);
      const b = toNum(item.amount);
      if (a !== null && b !== null) {
        merged[key].amount = (a + b).toString();
      }
      if (item.estimatedPrice !== undefined) {
        const prev = Number(merged[key].estimatedPrice) || 0;
        const add = Number(item.estimatedPrice) || 0;
        merged[key].estimatedPrice = prev + add;
      }
    });
    const mergedItems = Object.values(merged).map((item) => {
      const unit = String(item.unit || '').toLowerCase().trim();
      const amountNum = Number(String(item.amount || '').replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(amountNum)) return item;
      if (unit === 'g' && amountNum >= 1000) {
        return { ...item, amount: Number((amountNum / 1000).toFixed(3)).toString(), unit: 'kg' };
      }
      if (unit === 'ml' && amountNum >= 1000) {
        return { ...item, amount: Number((amountNum / 1000).toFixed(3)).toString(), unit: 'l' };
      }
      return item;
    });
    const mergedTotal = mergedItems.reduce((sum, item) => sum + (Number(item.estimatedPrice) || 0), 0);

    return {
      title: mealPlan?.title ? `${mealPlan.title} Shopping List` : 'Shopping List',
      description: 'Generated from meal plan ingredients',
      items: mergedItems,
      totalEstimatedCost: parseFloat(mergedTotal.toFixed(2)),
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
    const hasSnacks = preferences.includeSnacks === true;
    const defaultTypes = ['breakfast', 'lunch', 'dinner'];

    // Allow callers to explicitly choose which meals to generate
    const userSelectedMeals = Array.isArray(preferences.mealsToInclude)
      ? preferences.mealsToInclude.map((m) => String(m).toLowerCase()).filter(Boolean)
      : null;
    const enabledMeals = preferences.enabledMeals && typeof preferences.enabledMeals === 'object'
      ? Object.entries(preferences.enabledMeals)
          .filter(([, enabled]) => !!enabled)
          .map(([meal]) => meal.toLowerCase())
      : null;

    let baseTypes = defaultTypes;
    if (userSelectedMeals && userSelectedMeals.length) {
      baseTypes = defaultTypes.filter((m) => userSelectedMeals.includes(m));
    } else if (enabledMeals && enabledMeals.length) {
      baseTypes = defaultTypes.filter((m) => enabledMeals.includes(m));
    }

    const wantsSnack = userSelectedMeals
      ? userSelectedMeals.includes('snack')
      : enabledMeals
        ? enabledMeals.includes('snack')
        : hasSnacks;

    if (wantsSnack) {
      baseTypes.push('snack');
    }

    // Fallback to all main meals if user disabled everything
    if (!baseTypes.length) {
      baseTypes = defaultTypes;
      if (hasSnacks || mealTimes.snack) baseTypes.push('snack');
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

    const normalizeKeyName = (name) => {
      const base = normalizeName(name);
      if (!base) return '';
      const words = base.split(/\s+/).map((w) => {
        if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
          return w.slice(0, -1);
        }
        return w;
      });
      return words.join(' ');
    };

    ingredients.forEach(ingredient => {
      if (!ingredient || !ingredient.name) {
        return;
      }

      const unitKey = String(ingredient.unit || 'unit').toLowerCase().trim();
      const nameKey = normalizeKeyName(ingredient.name);
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
          name: ingredient.name || this.capitalizeWords(nameKey || ingredient.name)
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

      const text = await this.callTextModel(prompt, 0.4, 'json');
      
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
