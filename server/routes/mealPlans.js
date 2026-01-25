const express = require('express');
const router = express.Router();
const MealPlan = require('../models/MealPlan');
const ShoppingList = require('../models/ShoppingList');
const geminiService = require('../services/geminiService');
const FavoriteRecipe = require('../models/FavoriteRecipe');
const { findAlternatives, getRecipeById } = require('../services/recipeSearch/searchService');
const auth = require('../middleware/auth');
const { ensureMealImage } = require('../services/leonardoService');

const parseListQuery = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  const raw = String(value).trim();
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to comma parsing
    }
  }
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

const allowedIngredientCategories = new Set([
  'protein', 'vegetable', 'fruit', 'grain', 'dairy', 'fat',
  'spice', 'nut', 'seed', 'broth', 'herb', 'other'
]);

const getHitTitle = (hit) => hit?.title || hit?.name || hit?.recipe?.title || hit?.recipe?.name || '';
const normalizeTitle = (value) => String(value || '').toLowerCase().trim();

const sanitizeCategory = (cat) => {
  if (!cat || typeof cat !== 'string') return 'other';
  const lower = cat.toLowerCase();
  return allowedIngredientCategories.has(lower) ? lower : 'other';
};

const coerceServings = (...candidates) => {
  for (const val of candidates) {
    if (val === undefined || val === null) continue;
    const raw = typeof val === 'string' ? val.trim() : val;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
    if (typeof raw === 'string' && raw) {
      const match = raw.match(/(\d+(\.\d+)?)/);
      if (match) {
        const num = Number(match[1]);
        if (Number.isFinite(num) && num > 0) return Math.round(num);
      }
    }
  }
  return 1;
};

const mapSearchHitToPlanRecipe = (hit) => {
  if (!hit) return null;
  const ingredients = Array.isArray(hit.ingredients_parsed) && hit.ingredients_parsed.length
    ? hit.ingredients_parsed.map((ing) => ({
        name: ing.name || '',
        amount: ing.amount || '1',
        unit: ing.unit || 'unit',
        category: sanitizeCategory(ing.category)
      }))
    : Array.isArray(hit.ingredients)
      ? hit.ingredients.map((ing) => ({
          name: ing.name || ing,
          amount: ing.amount || ing.quantity || '1',
          unit: ing.unit || ing.measure || 'unit',
          category: sanitizeCategory(ing.category)
        }))
      : [];

  const instructions = hit.instructions
    ? String(hit.instructions)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

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
  const nSrc = hit.nutrition || hit;
  addNumber('calories', nSrc.calories);
  addNumber('protein', nSrc.protein_g, nSrc.protein_grams, nSrc.protein);
  addNumber('carbs', nSrc.carbs_g, nSrc.carbs_grams, nSrc.carbs);
  addNumber('fat', nSrc.fat_g, nSrc.fat_grams, nSrc.fat);
  addNumber('fiber', nSrc.fiber_g, nSrc.fiber_grams, nSrc.fiber);
  addNumber('sugar', nSrc.sugar_g, nSrc.sugar_grams, nSrc.sugar);
  addNumber('fiber', nSrc.fiber_g, nSrc.fiber_grams, nSrc.fiber);
  addNumber('sugar', nSrc.sugar_g, nSrc.sugar_grams, nSrc.sugar);

  return {
    externalId: hit.id,
    name: hit.title || hit.name || 'Untitled recipe',
    description: hit.description || '',
    prepTime: Number(hit.prep_time_minutes) || Number(hit.total_time_minutes) || undefined,
    cookTime: Number(hit.cook_time_minutes) || undefined,
    servings: coerceServings(hit.servings, hit.yield, hit.serves, hit.recipe?.servings),
    ingredients,
    instructions,
    nutrition,
    tags: hit.tags || hit.dietary_tags || hit.diet_tags || [],
    difficulty: hit.difficulty || 'easy'
  };
};

const nutritionTotalsFromRecipe = (recipe) => ({
  calories: recipe?.nutrition?.calories ?? 0,
  protein: recipe?.nutrition?.protein ?? 0,
  carbs: recipe?.nutrition?.carbs ?? 0,
  fat: recipe?.nutrition?.fat ?? 0
});

// Get all meal plans for user
router.get('/', auth, async (req, res) => {
  try {
    console.log('📋 GET /api/meal-plans called for user:', req.user._id);
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { userId: req.user._id };
    if (status) {
      query.status = status;
    }

    const mealPlans = await MealPlan.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'username email');

    const total = await MealPlan.countDocuments(query);

    console.log(`✅ Found ${mealPlans.length} meal plans (total: ${total})`);
    console.log('First plan:', mealPlans[0] ? { title: mealPlans[0].title, days: mealPlans[0].days?.length } : 'None');
  
    res.json({
      mealPlans,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get meal plans error:', error);
    res.status(500).json({ message: 'Server error fetching meal plans' });
  }
});

// Get nutrition statistics (must be before /:id route)
router.get('/stats', auth, async (req, res) => {
  try {
    console.log('📊 Stats endpoint called for user:', req.user._id);
    const mealPlans = await MealPlan.find({ userId: req.user._id });
    console.log(`📋 Found ${mealPlans.length} meal plans in database`);

    let totalStats = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0
    };

    let consumedMealsCount = 0;
    let totalMealsCount = 0;
    let completedMealsDebug = [];
    
    // Track nutrition by date for charts
    const nutritionByDate = {};

    mealPlans.forEach((plan, planIdx) => {
      console.log(`  Plan ${planIdx + 1}: "${plan.title}" - ${plan.days?.length || 0} days`);
      plan.days.forEach((day, dayIdx) => {
        const dateKey = day.date ? new Date(day.date).toISOString().split('T')[0] : null;
        
        day.meals.forEach((meal, mealIdx) => {
          totalMealsCount++;
          console.log(`    Day ${dayIdx}, Meal ${mealIdx} (${meal.type}): isCompleted = ${meal.isCompleted}`);
          // Only count meals that are marked as completed
          if (meal.isCompleted) {
            consumedMealsCount++;
            completedMealsDebug.push(`${meal.type} on Day ${dayIdx + 1}`);
            
            // Calculate nutrition from recipes
            meal.recipes.forEach(recipe => {
              if (recipe.nutrition) {
                const nutrition = recipe.nutrition;
                totalStats.calories += nutrition.calories || 0;
                totalStats.protein += nutrition.protein || 0;
                totalStats.carbs += nutrition.carbs || 0;
                totalStats.fat += nutrition.fat || 0;
                totalStats.fiber += nutrition.fiber || 0;
                totalStats.sugar += nutrition.sugar || 0;
                
                // Track by date for charts
                if (dateKey) {
                  if (!nutritionByDate[dateKey]) {
                    nutritionByDate[dateKey] = {
                      date: dateKey,
                      calories: 0,
                      protein: 0,
                      carbs: 0,
                      fat: 0,
                      fiber: 0,
                      sugar: 0
                    };
                  }
                  nutritionByDate[dateKey].calories += nutrition.calories || 0;
                  nutritionByDate[dateKey].protein += nutrition.protein || 0;
                  nutritionByDate[dateKey].carbs += nutrition.carbs || 0;
                  nutritionByDate[dateKey].fat += nutrition.fat || 0;
                  nutritionByDate[dateKey].fiber += nutrition.fiber || 0;
                  nutritionByDate[dateKey].sugar += nutrition.sugar || 0;
                }
              }
            });
          }
        });
      });
    });

    // Convert nutritionByDate to sorted array
    const dailyNutrition = Object.values(nutritionByDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(day => ({
        ...day,
        calories: Math.round(day.calories),
        protein: Math.round(day.protein),
        carbs: Math.round(day.carbs),
        fat: Math.round(day.fat),
        fiber: Math.round(day.fiber),
        sugar: Math.round(day.sugar)
      }));

    console.log(`✅ Stats calculated: ${consumedMealsCount} completed meals out of ${totalMealsCount} total`);
    console.log(`   Completed meals:`, completedMealsDebug);
    console.log(`   Total calories:`, totalStats.calories);
    console.log(`   Days with data:`, dailyNutrition.length);

    res.json({
      totalStats,
      consumedMealsCount,
      totalMealsCount,
      averageCaloriesPerMeal: consumedMealsCount > 0 ? Math.round(totalStats.calories / consumedMealsCount) : 0,
      mealPlansCount: mealPlans.length,
      dailyNutrition
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error fetching statistics' });
  }
});

// Get specific meal plan
router.get('/:id', auth, async (req, res) => {
  try {
    console.log('📋 GET /api/meal-plans/:id called for:', req.params.id);
    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('userId', 'username email');

    if (!mealPlan) {
      console.log('❌ Meal plan not found');
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    console.log('✅ Returning meal plan:', mealPlan.title, 'with', mealPlan.days?.length, 'days');

    res.json(mealPlan);
  } catch (error) {
    console.error('Get meal plan error:', error);
    res.status(500).json({ message: 'Server error fetching meal plan' });
  }
});

// Create new meal plan
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, startDate, endDate, days, generatedBy = 'manual' } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Title, start date, and end date are required' 
      });
    }

    const mealPlan = new MealPlan({
      userId: req.user._id,
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: days || [],
      generatedBy,
      status: 'draft'
    });

    await mealPlan.save();

    res.status(201).json({
      message: 'Meal plan created successfully',
      mealPlan
    });
  } catch (error) {
    console.error('Create meal plan error:', error);
    res.status(500).json({ message: 'Server error creating meal plan' });
  }
});

// Generate meal plan with AI
router.post('/generate', auth, async (req, res) => {
  try {
    console.log('🚀 Starting AI meal plan generation');
    const { duration = 7, preferences } = req.body;
    
    if (!preferences) {
      return res.status(400).json({ message: 'User preferences are required' });
    }

    console.log('⏱️ Duration:', duration);
    console.log('🎯 Preferences:', preferences);

    const tGenStart = Date.now();
    // Generate meal plan using Gemini AI
    const aiMealPlan = await geminiService.generateMealPlan(preferences, duration);
    console.log(`✅ Meal plan generated in ${Date.now() - tGenStart} ms`);

    const servingsLog = [];
    (aiMealPlan?.days || []).forEach((day) => {
      (day?.meals || []).forEach((meal) => {
        const recipe = meal?.recipes?.[0] || {};
        const servings = recipe?.servings ?? meal?.servings ?? null;
        servingsLog.push({
          title: recipe?.name || recipe?.title || meal?.type || 'Meal',
          servings,
        });
      });
    });
    if (servingsLog.length) {
      const missing = servingsLog.filter((entry) => !entry.servings).length;
      console.log('🍽️ Generated servings (sample):', servingsLog.slice(0, 20));
      console.log(`🍽️ Generated servings summary: ${servingsLog.length} recipes, ${missing} missing`);
    }
    
    // Calculate start and end dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + duration - 1);

    // Create meal plan document
    const mealPlan = new MealPlan({
      userId: req.user._id,
      title: aiMealPlan.title || `AI Generated Meal Plan - ${duration} days`,
      description: aiMealPlan.description || 'Generated by AI based on your preferences',
      startDate,
      endDate,
      days: aiMealPlan.days || [],
      generatedBy: 'gemini-ai',
      status: 'draft',
      preferences
    });

    await mealPlan.save();

    res.status(201).json({
      message: 'AI meal plan generated successfully',
      mealPlan
    });
  } catch (error) {
    console.error('Generate meal plan error:', error);
    res.status(500).json({ message: 'Failed to generate meal plan' });
  }
});

// Update meal plan
const updateMealPlan = async (req, res) => {
  try {
    console.log('🔄 Updating meal plan:', req.params.id, 'payload keys:', Object.keys(req.body || {}));
    const { title, description, days, status, startDate, endDate } = req.body || {};

    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!mealPlan) {
      console.log('❌ Meal plan not found for update');
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    if (title) mealPlan.title = title;
    if (description) mealPlan.description = description;
    if (days) mealPlan.days = days;
    if (status) mealPlan.status = status;

    let parsedStart = startDate ? new Date(startDate) : null;
    if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
      // normalize to midday to reduce TZ drift when serializing dates
      parsedStart.setHours(12, 0, 0, 0);
      mealPlan.startDate = parsedStart;
    } else {
      parsedStart = mealPlan.startDate ? new Date(mealPlan.startDate) : null;
      if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
        parsedStart.setHours(12, 0, 0, 0);
      }
    }

    let parsedEnd = endDate ? new Date(endDate) : null;
    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      parsedEnd.setHours(12, 0, 0, 0);
      mealPlan.endDate = parsedEnd;
    }

    // If we have a valid start date and days, rebase day.date sequentially
    if (parsedStart && Array.isArray(mealPlan.days)) {
      mealPlan.days = mealPlan.days.map((day, idx) => {
        const d = new Date(parsedStart);
        d.setDate(d.getDate() + idx);
        d.setHours(12, 0, 0, 0);
        return {
          ...day,
          date: d
        };
      });
      // Update endDate to match the last day if not explicitly provided
      const lastDay = mealPlan.days[mealPlan.days.length - 1];
      if (lastDay?.date) {
        mealPlan.endDate = new Date(lastDay.date);
      }
    }

    await mealPlan.save();

    console.log('✅ Meal plan updated:', mealPlan.title, 'status:', mealPlan.status, 'start:', mealPlan.startDate, 'end:', mealPlan.endDate);

    res.json({
      message: 'Meal plan updated successfully',
      mealPlan
    });
  } catch (error) {
    console.error('Update meal plan error:', error);
    res.status(500).json({ message: 'Server error updating meal plan' });
  }
};

router.put('/:id', auth, updateMealPlan);
router.patch('/:id', auth, updateMealPlan);

// Activate meal plan
router.post('/:id/activate', auth, async (req, res) => {
  try {
    console.log('🎯 Activating meal plan:', req.params.id);
    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!mealPlan) {
      console.log('❌ Meal plan not found for activation');
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    // Deactivate other active meal plans
    const deactivated = await MealPlan.updateMany(
      { userId: req.user._id, status: 'active' },
      { status: 'archived' }
    );
    
    console.log(`📋 Deactivated ${deactivated.modifiedCount} other meal plans`);

    // Activate this meal plan
    mealPlan.status = 'active';
    await mealPlan.save();

    console.log('✅ Meal plan activated:', mealPlan.title);

    res.json({
      message: 'Meal plan activated successfully',
      mealPlan
    });
  } catch (error) {
    console.error('Activate meal plan error:', error);
    res.status(500).json({ message: 'Server error activating meal plan' });
  }
});

// Delete meal plan
router.delete('/:id', auth, async (req, res) => {
  try {
    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!mealPlan) {
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    // Also delete associated shopping lists
    await ShoppingList.deleteMany({ mealPlanId: mealPlan._id });

    await MealPlan.findByIdAndDelete(mealPlan._id);

    res.json({ message: 'Meal plan deleted successfully' });
  } catch (error) {
    console.error('Delete meal plan error:', error);
    res.status(500).json({ message: 'Server error deleting meal plan' });
  }
});

// Get alternatives for a specific meal within a meal plan
router.get('/:id/days/:dayIndex/meals/:mealIndex/alternatives', auth, async (req, res) => {
  try {
    const { id, dayIndex, mealIndex } = req.params;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 3, 10));
    const preferFavorites = String(req.query.preferFavorites || '').toLowerCase() === 'true';

    const mealPlan = await MealPlan.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!mealPlan) {
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    const day = mealPlan.days?.[dayIndex];
    const meal = day?.meals?.[mealIndex];
    if (!day || !meal) {
      return res.status(404).json({ message: 'Meal not found at specified indices' });
    }

    const mealRecipeIds = (meal.recipes || [])
      .map((r) => r.externalId || r.id)
      .filter(Boolean);
    const mealRecipeTitles = (meal.recipes || [])
      .map((r) => r.title || r.name)
      .filter(Boolean);
    const requestExcludeIds = parseListQuery(req.query.excludeIds);
    const requestExcludeTitles = parseListQuery(req.query.excludeTitles);
    console.log('🔁 Alternatives excludeIds', {
      mealPlanId: id,
      dayIndex,
      mealIndex,
      excludeIds: requestExcludeIds,
      excludeTitles: requestExcludeTitles
    });
    const excludeIds = [...mealRecipeIds, ...requestExcludeIds].filter(Boolean);
    const excludeTitles = [...mealRecipeTitles, ...requestExcludeTitles]
      .map((t) => normalizeTitle(t))
      .filter(Boolean);
    const excludeTitleSet = new Set(excludeTitles);

    const preferences = {
      // Request-level overrides
      dietType: req.query.dietType || null,
      allergies: parseListQuery(req.query.allergies),
      dislikedFoods: parseListQuery(req.query.dislikedFoods),
      cuisine: req.query.cuisine || null,
      goals: req.query.goal_fit || null,
      activityLevel: req.query.activity_fit || null,
      additionalNotes: req.query.notes || null
    };

    const planPrefs = mealPlan.preferences || mealPlan.userPreferences || {};
    const mergedPrefs = {
      dietType: preferences.dietType || mealPlan?.dietType || planPrefs.dietType || null,
      allergies: preferences.allergies.length ? preferences.allergies : parseListQuery(planPrefs.allergies),
      dislikedFoods: preferences.dislikedFoods.length ? preferences.dislikedFoods : parseListQuery(planPrefs.dislikedFoods),
      cuisine: preferences.cuisine || day.cuisine || mealPlan?.cuisine || planPrefs.cuisine || null,
      goals: preferences.goals || mealPlan?.goals || planPrefs.goals || null,
      activityLevel: preferences.activityLevel || mealPlan?.activityLevel || planPrefs.activityLevel || null,
      includeIngredients: parseListQuery(planPrefs.includeIngredients),
      excludeIngredients: parseListQuery(planPrefs.excludeIngredients),
      additionalNotes: preferences.additionalNotes || planPrefs.additionalNotes || null
    };

    let alternatives = [];
    let candidatePool = [];
    // Pull recent favorites for this user to surface as quick picks
    let favoriteAlts = [];
    try {
      const favorites = await FavoriteRecipe.find({ userId: req.user._id }).sort({ updatedAt: -1 }).limit(5);
      favoriteAlts = favorites.map((fav) => ({
        id: fav.externalId || fav._id,
        title: fav.title,
        description: '',
        calories: fav.calories,
        protein_grams: fav.protein,
        prep_time_minutes: fav.totalTime,
        tags: fav.tags || [],
        image: fav.planRecipe?.image || fav.planRecipe?.imageUrl || fav.image || fav.imageUrl,
        imageUrl: fav.planRecipe?.image || fav.planRecipe?.imageUrl || fav.image || fav.imageUrl,
        source: 'favorite',
        recipe: fav.planRecipe
      }));
    } catch (err) {
      console.warn('⚠️ Could not load favorites', err.message);
    }

    try {
      console.log(`🔍 Fetching alternatives for ${meal.type} (day ${dayIndex}) with prefs:`, mergedPrefs);
      const candidates = await geminiService.fetchCandidatesForMeal(meal.type, mergedPrefs, limit * 2);
      candidatePool = candidates || [];
      const excludeSet = new Set(excludeIds.filter(Boolean).map(String));
      const filtered = (candidatePool || []).filter((c) => {
        const title = normalizeTitle(getHitTitle(c));
        return !excludeSet.has(String(c.id)) && (!title || !excludeTitleSet.has(title));
      });
      alternatives = filtered.slice(0, limit);
      if (!alternatives.length && excludeSet.size) {
        alternatives = (candidatePool || []).slice(0, limit);
      }
    } catch (err) {
      console.warn('⚠️ Alternative fetch via Gemini failed, falling back to ES:', err.message);
      candidatePool = await findAlternatives({
        mealType: meal.type,
        cuisine: mergedPrefs.cuisine,
        dietType: mergedPrefs.dietType,
        allergies: mergedPrefs.allergies,
        dislikedFoods: mergedPrefs.dislikedFoods,
        excludeIds,
        size: limit,
        goal_fit: mergedPrefs.goals,
        activity_fit: mergedPrefs.activityLevel
      });
      alternatives = candidatePool.filter((c) => {
        const title = normalizeTitle(getHitTitle(c));
        return !excludeSet.has(String(c.id)) && (!title || !excludeTitleSet.has(title));
      });
      if (!alternatives.length && excludeIds.length) {
        candidatePool = await findAlternatives({
          mealType: meal.type,
          cuisine: mergedPrefs.cuisine,
          dietType: mergedPrefs.dietType,
          allergies: mergedPrefs.allergies,
          dislikedFoods: mergedPrefs.dislikedFoods,
          excludeIds: [],
          size: limit,
          goal_fit: mergedPrefs.goals,
          activity_fit: mergedPrefs.activityLevel
        });
        alternatives = candidatePool.filter((c) => {
          const title = normalizeTitle(getHitTitle(c));
          return !excludeSet.has(String(c.id)) && (!title || !excludeTitleSet.has(title));
        });
      }
    }

    if (preferFavorites) {
      const excludeSet = new Set(excludeIds.filter(Boolean).map(String));
      const favoritePool = (favoriteAlts || []).map((fav) => ({
        id: String(fav.id),
        source: 'favorite',
        title: fav.title,
        calories: fav.calories,
        protein_grams: fav.protein_grams,
        prep_time_minutes: fav.prep_time_minutes,
        hit: fav
      }));
      const candidateList = (candidatePool || alternatives || []).map((hit) => ({
        id: String(hit.id),
        source: 'candidate',
        title: getHitTitle(hit),
        calories: hit.calories,
        protein_grams: hit.protein_grams,
        prep_time_minutes: hit.prep_time_minutes,
        hit
      }));
      const availableFavorites = favoritePool.filter((f) => {
        const title = normalizeTitle(f.title);
        return !excludeSet.has(f.id) && (!title || !excludeTitleSet.has(title));
      });
      const availableCandidates = candidateList.filter((c) => {
        const title = normalizeTitle(c.title);
        return !excludeSet.has(c.id) && (!title || !excludeTitleSet.has(title));
      });

      let picked = [];
      try {
        const prompt = `
        Choose up to ${limit} recipe ids from the two pools below.
        Prefer favorites whenever possible, but fill with candidates if needed.
        Return ONLY JSON: { "picks": [{ "id": "string", "source": "favorite|candidate" }] }
        Favorites: ${JSON.stringify(availableFavorites.map((f) => ({
          id: f.id,
          title: f.title,
          calories: f.calories,
          protein_grams: f.protein_grams,
          prep_time_minutes: f.prep_time_minutes
        })), null, 2)}
        Candidates: ${JSON.stringify(availableCandidates.map((c) => ({
          id: c.id,
          title: c.title,
          calories: c.calories,
          protein_grams: c.protein_grams,
          prep_time_minutes: c.prep_time_minutes
        })), null, 2)}
        `;
        const pickText = await geminiService.callTextModel(prompt, 0.2, 'json');
        const pickJson = (() => {
          try {
            const cleaned = (pickText || '').replace(/```json|```/gi, '').trim();
            return JSON.parse(cleaned);
          } catch {
            return null;
          }
        })();
        const picks = Array.isArray(pickJson?.picks) ? pickJson.picks : [];
        if (picks.length) {
          const favMap = new Map(availableFavorites.map((f) => [`favorite:${f.id}`, f]));
          const candMap = new Map(availableCandidates.map((c) => [`candidate:${c.id}`, c]));
          picked = picks
            .map((p) => {
              const key = `${p.source}:${p.id}`;
              return p.source === 'favorite' ? favMap.get(key) : candMap.get(key);
            })
            .filter(Boolean);
        }
      } catch (err) {
        console.warn('⚠️ Alternative pick via LLM failed:', err.message);
      }

      if (!picked.length) {
        picked = [...availableFavorites, ...availableCandidates].slice(0, limit);
      }
      if (!picked.length && excludeSet.size) {
        picked = [...favoritePool, ...candidateList].slice(0, limit);
      }
      alternatives = picked.map((p) => p.hit);
    }

    const summarized = alternatives.map((hit) => ({
      id: hit.id,
      title: getHitTitle(hit),
      description: hit.description,
      cuisine: hit.cuisine,
      meal_type: hit.meal_type,
      calories: hit.calories,
      protein_grams: hit.protein_grams,
      prep_time_minutes: hit.prep_time_minutes,
      cook_time_minutes: hit.cook_time_minutes,
      tags: hit.tags || hit.dietary_tags || hit.diet_tags || [],
      recipe: mapSearchHitToPlanRecipe(hit)
    }));

    res.json({ alternatives: summarized, favorites: favoriteAlts, count: summarized.length });
  } catch (error) {
    console.error('❌ Fetch alternatives error:', error);
    res.status(500).json({ message: 'Server error fetching alternatives' });
  }
});

// Replace a meal with a selected alternative
router.patch('/:id/days/:dayIndex/meals/:mealIndex', auth, async (req, res) => {
  try {
    const { id, dayIndex, mealIndex } = req.params;
    const { recipeId, recipe: recipePayload } = req.body || {};

    const mealPlan = await MealPlan.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!mealPlan) {
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    const day = mealPlan.days?.[dayIndex];
    const meal = day?.meals?.[mealIndex];
    if (!day || !meal) {
      return res.status(404).json({ message: 'Meal not found at specified indices' });
    }

    let sourceRecipe = recipePayload;
    if (!sourceRecipe && recipeId) {
      sourceRecipe = await getRecipeById(recipeId);
      if (!sourceRecipe) {
        return res.status(404).json({ message: 'Recipe not found' });
      }
    }

    const mappedRecipe = mapSearchHitToPlanRecipe(sourceRecipe);
    if (!mappedRecipe) {
      return res.status(400).json({ message: 'No recipe data provided' });
    }

    meal.recipes = [mappedRecipe];
    await ensureMealImage(meal);
    meal.totalNutrition = nutritionTotalsFromRecipe(mappedRecipe);
    meal.isCompleted = false;
    meal.completedAt = undefined;

    mealPlan.markModified('days');
    await mealPlan.save();

    res.json({
      message: 'Meal updated with alternative',
      meal: mealPlan.days[dayIndex].meals[mealIndex]
    });
  } catch (error) {
    console.error('❌ Replace meal error:', error);
    res.status(500).json({ message: 'Server error replacing meal' });
  }
});

// Ensure/generate an image for a meal (Leonardo)
router.post('/:id/days/:dayIndex/meals/:mealIndex/image', auth, async (req, res) => {
  try {
    const { id, dayIndex, mealIndex } = req.params;
    const mealPlan = await MealPlan.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!mealPlan) return res.status(404).json({ message: 'Meal plan not found' });
    const day = mealPlan.days?.[dayIndex];
    const meal = day?.meals?.[mealIndex];
    if (!day || !meal) return res.status(404).json({ message: 'Meal not found' });

    const before = meal.recipes?.[0]?.image || meal.recipes?.[0]?.imageUrl;
    await ensureMealImage(meal, { throwOnFail: true });
    const after = meal.recipes?.[0]?.image || meal.recipes?.[0]?.imageUrl;

    if (after) {
      // Persist the image fields on the first recipe to avoid version conflicts
      const base = `days.${dayIndex}.meals.${mealIndex}.recipes.0`;
      await MealPlan.updateOne(
        { _id: id, userId: req.user._id },
        {
          $set: {
            [`${base}.image`]: after,
            [`${base}.imageUrl`]: after,
          },
        }
      );
    }

    // Return the updated image info without requiring a full refetch
    return res.json({
      message: after ? 'Image ensured' : 'No image generated',
      image: after || before || null,
      meal: {
        ...meal.toObject?.() || meal,
        recipes: [
          {
            ...(meal.recipes?.[0]?.toObject?.() || meal.recipes?.[0] || {}),
            image: after || before || null,
            imageUrl: after || before || null,
          },
          ...(meal.recipes || []).slice(1),
        ],
      },
    });
  } catch (error) {
    console.error('❌ Ensure meal image error:', error);
    res.status(500).json({ message: 'Server error ensuring meal image', error: error?.message });
  }
});

// Toggle meal completion status
router.post('/:id/days/:dayIndex/meals/:mealIndex/toggle', auth, async (req, res) => {
  try {
    const { id, dayIndex, mealIndex } = req.params;
    const { isCompleted } = req.body;

    console.log(`🔄 Toggle meal completion request: Plan ${id}, Day ${dayIndex}, Meal ${mealIndex}, isCompleted: ${isCompleted}`);

    const mealPlan = await MealPlan.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!mealPlan) {
      console.log('❌ Meal plan not found');
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    if (!mealPlan.days[dayIndex] || !mealPlan.days[dayIndex].meals[mealIndex]) {
      console.log('❌ Meal not found at specified indices');
      return res.status(404).json({ message: 'Meal not found' });
    }

    // Toggle or set completion status
    const newStatus = typeof isCompleted === 'boolean' 
      ? isCompleted 
      : !mealPlan.days[dayIndex].meals[mealIndex].isCompleted;

    console.log(`  Previous status: ${mealPlan.days[dayIndex].meals[mealIndex].isCompleted}, New status: ${newStatus}`);

    mealPlan.days[dayIndex].meals[mealIndex].isCompleted = newStatus;
    if (newStatus) {
      mealPlan.days[dayIndex].meals[mealIndex].completedAt = new Date();
    } else {
      mealPlan.days[dayIndex].meals[mealIndex].completedAt = undefined;
    }

    await mealPlan.save();

    console.log(`✅ Meal completion toggled successfully in database`);

    res.json({
      message: `Meal marked as ${newStatus ? 'completed' : 'pending'}`,
      meal: mealPlan.days[dayIndex].meals[mealIndex]
    });
  } catch (error) {
    console.error('❌ Toggle meal completion error:', error);
    res.status(500).json({ message: 'Server error toggling meal completion' });
  }
});

// Get today's meals
router.get('/today/meals', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mealPlan = await MealPlan.findOne({
      userId: req.user._id,
      status: 'active',
      startDate: { $lte: today },
      endDate: { $gte: today }
    });

    if (!mealPlan) {
      return res.json({ meals: [], message: 'No active meal plan for today' });
    }

    const todayString = today.toISOString().split('T')[0];
    const todayMeals = mealPlan.days.find(day => 
      day.date.toISOString().split('T')[0] === todayString
    );

    res.json({
      meals: todayMeals ? todayMeals.meals : [],
      mealPlan: {
        id: mealPlan._id,
        title: mealPlan.title,
        description: mealPlan.description
      }
    });
  } catch (error) {
    console.error('Get today meals error:', error);
    res.status(500).json({ message: 'Server error fetching today meals' });
  }
});

// Generate shopping list for meal plan
router.post('/:id/shopping-list', auth, async (req, res) => {
  try {
    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!mealPlan) {
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    // Generate shopping list using AI
    const shoppingListData = await geminiService.generateShoppingList(mealPlan);

    // Create shopping list document
    const shoppingList = new ShoppingList({
      userId: req.user._id,
      mealPlanId: mealPlan._id,
      title: shoppingListData.title,
      description: shoppingListData.description,
      items: shoppingListData.items,
      status: 'draft',
      totalEstimatedCost: shoppingListData.totalEstimatedCost,
      store: shoppingListData.store
    });

    await shoppingList.save();

    res.status(201).json({
      message: 'Shopping list generated successfully',
      shoppingList
    });
  } catch (error) {
    console.error('Generate shopping list error:', error);
    res.status(500).json({ message: 'Failed to generate shopping list' });
  }
});

module.exports = router;
