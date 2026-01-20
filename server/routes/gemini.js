const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const auth = require('../middleware/auth');
const MealPlan = require('../models/MealPlan');
const { logEvent } = require('../utils/logger');

// Chat with dietitian
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Try to fetch the user's active meal plan
    let activeMealPlan = null;
    let mealPlanHistory = [];
    try {
      // First try to find an explicitly active meal plan
      activeMealPlan = await MealPlan.findOne({
        userId: req.user._id,
        status: 'active'
      }).sort({ createdAt: -1 });

      // If no active meal plan, get the most recent one regardless of status
      if (!activeMealPlan) {
        activeMealPlan = await MealPlan.findOne({
          userId: req.user._id
        }).sort({ createdAt: -1 });
      }

      // Fetch a short history of recent meal plans for extra context
      mealPlanHistory = await MealPlan.find({ userId: req.user._id })
        .sort({ startDate: -1 })
        .limit(12)
        .lean();

      if (activeMealPlan) {
        console.log(`📋 Found meal plan for chat context: "${activeMealPlan.title}" (Status: ${activeMealPlan.status})`);
      } else {
        console.log('📋 No meal plan found for chat context');
      }
    } catch (err) {
      console.log('❌ Could not fetch meal plan for chat context:', err.message);
    }

    const response = await geminiService.chatWithDietitian(
      message, 
      conversationHistory,
      activeMealPlan,
      req.user,
      mealPlanHistory
    );
    
    res.json({
      message: response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in dietitian chat:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to get dietitian response',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Generate meal plan
router.post('/generate-meal-plan', auth, async (req, res) => {
  try {
    const { duration = 7, preferences = {}, startDate: startDateInput } = req.body;
    
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ message: 'User preferences are required' });
    }

    // Normalize meal selection to respect user toggles from the UI
    const enabledMeals = preferences.enabledMeals && typeof preferences.enabledMeals === 'object'
      ? Object.entries(preferences.enabledMeals)
          .filter(([, enabled]) => !!enabled)
          .map(([meal]) => String(meal).toLowerCase())
      : [];
    const mealsFromPayload = Array.isArray(preferences.mealsToInclude)
      ? preferences.mealsToInclude.map(m => String(m).toLowerCase()).filter(Boolean)
      : [];
    const selectedMeals = mealsFromPayload.length ? mealsFromPayload : enabledMeals;
    if (selectedMeals.length) {
      preferences.mealsToInclude = selectedMeals;
      preferences.includeSnacks = selectedMeals.includes('snack');
    }

    const allowedRecipeDifficulties = ['easy', 'medium', 'hard'];
    const sanitizeRecipeDifficulty = (val) => {
      const d = String(val || '').toLowerCase();
      if (d === 'moderate') return 'medium';
      if (d === 'difficult' || d === 'harder' || d === 'hardest') return 'hard';
      if (allowedRecipeDifficulties.includes(d)) return d;
      return 'medium';
    };

    const sanitizePreferenceDifficulty = (val) => {
      const d = String(val || '').toLowerCase();
      if (d === 'moderate') return 'medium';
      if (d === 'difficult' || d === 'harder' || d === 'hardest') return 'hard';
      if (allowedRecipeDifficulties.includes(d)) return d;
      if (d === 'any' || d === '') return 'any';
      return 'any';
    };

    const tStart = Date.now();
    await logEvent({
      level: 'info',
      message: 'mealPlan:generation:start',
      user: req.user,
      meta: { duration, preferences }
    });

    // Generate meal plan using Gemini AI
    const aiMealPlan = await geminiService.generateMealPlan({
      ...preferences,
      difficulty: sanitizePreferenceDifficulty(preferences.difficulty)
    }, duration, req.user);
    
    // Calculate start and end dates (respect user-provided startDate)
    const parseStart = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startDate = parseStart(startDateInput) || new Date();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + duration - 1);

    // Sanitize meal plan data to ensure it meets schema requirements
    const validCategories = ['protein', 'vegetable', 'fruit', 'grain', 'dairy', 'fat', 'spice', 'nut', 'seed', 'broth', 'herb', 'other'];
    const sanitizeIngredient = (ing, idx) => {
      if (!ing) return null;
      const nameCandidate = ing.name || ing.item || ing.ingredient || '';
      const name = String(nameCandidate).trim() || `Ingredient ${idx + 1}`;
      const hasAmount = ing.amount && String(ing.amount).trim().length > 0;
      const amount = hasAmount ? String(ing.amount).trim() : '1';
      const unit = ing?.unit || ing?.measure || 'unit';
      const cat = String(ing?.category || '').toLowerCase();
      const category = validCategories.includes(cat) ? cat : 'other';
      return { ...ing, name, amount, unit, category };
    };

    const sanitizeNutrition = (nut) => ({
      calories: Number(nut?.calories) || 0,
      protein: Number(nut?.protein) || 0,
      carbs: Number(nut?.carbs) || 0,
      fat: Number(nut?.fat) || 0,
      fiber: Number(nut?.fiber) || 0,
      sugar: Number(nut?.sugar) || 0
    });

    const defaultMealTimes = {
      breakfast: '08:00',
      lunch: '12:30',
      dinner: '19:00',
      snack: '15:30',
    };
    const resolveMealTime = (mealType) =>
      preferences.mealTimes?.[mealType] || defaultMealTimes[mealType] || '12:00';

    // Build sanitized days asynchronously to allow LLM-based ingredient normalization
    const sanitizedDays = [];
    for (const day of aiMealPlan.days || []) {
      const mealsOut = [];
      for (const meal of day.meals || []) {
        const recipesOut = [];
        for (const recipe of meal.recipes || []) {
            const normalizedIngredients = await geminiService.normalizeIngredientsWithModel(recipe.ingredients || []);
            const ingredients = Array.isArray(normalizedIngredients)
              ? normalizedIngredients.map((ing, idx) => sanitizeIngredient(ing, idx)).filter(Boolean)
              : [];
            recipesOut.push({
              ...recipe,
              nutrition: sanitizeNutrition(recipe.nutrition),
              difficulty: sanitizeRecipeDifficulty(recipe.difficulty),
              ingredients
            });
          }
        mealsOut.push({
          ...meal,
          scheduledTime: meal.scheduledTime || resolveMealTime(String(meal.type || '').toLowerCase()),
          totalNutrition: sanitizeNutrition(meal.totalNutrition),
          recipes: recipesOut
        });
      }
      sanitizedDays.push({ ...day, meals: mealsOut });
    }

    // Create meal plan document
    const mealPlan = new MealPlan({
      userId: req.user._id,
      title: aiMealPlan.title || `AI Generated Meal Plan - ${duration} days`,
      description: aiMealPlan.description || 'Generated by AI based on your preferences',
      startDate,
      endDate,
      days: sanitizedDays,
      generatedBy: 'gemini-ai',
      status: 'draft',
      preferences
    });

    await mealPlan.save();
    console.log(`✅ Saved meal plan to database: ${mealPlan._id} - "${mealPlan.title}"`);
    await logEvent({
      level: 'info',
      message: 'mealPlan:generation:success',
      user: req.user,
      meta: {
        duration,
        mealPlanId: mealPlan._id,
        title: mealPlan.title,
        tookMs: Date.now() - tStart
      }
    });

    res.json({
      mealPlan,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating meal plan:', error);
    await logEvent({
      level: 'error',
      message: 'mealPlan:generation:error',
      user: req.user,
      meta: { error: error.message, stack: error.stack }
    });
    res.status(500).json({ message: 'Failed to generate meal plan' });
  }
});

// Get recipe suggestion
router.post('/recipe-suggestion', auth, async (req, res) => {
  try {
    const { ingredients, dietType, mealType } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ message: 'Ingredients array is required' });
    }

    if (!dietType) {
      return res.status(400).json({ message: 'Diet type is required' });
    }

    if (!mealType) {
      return res.status(400).json({ message: 'Meal type is required' });
    }

    const recipe = await geminiService.getRecipeSuggestion(ingredients, dietType, mealType);
    
    res.json({
      recipe,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting recipe suggestion:', error);
    res.status(500).json({ message: 'Failed to get recipe suggestion' });
  }
});

// Generate shopping list from meal plan
router.post('/generate-shopping-list', auth, async (req, res) => {
  try {
    const { mealPlan } = req.body;
    
    if (!mealPlan) {
      return res.status(400).json({ message: 'Meal plan is required' });
    }

    const tStart = Date.now();
    await logEvent({
      level: 'info',
      message: 'shoppingList:generation:start',
      user: req.user,
      meta: { mealPlanId: mealPlan?._id || mealPlan?.id }
    });

    const shoppingList = await geminiService.generateShoppingList(mealPlan);
    await logEvent({
      level: 'info',
      message: 'shoppingList:generation:success',
      user: req.user,
      meta: { mealPlanId: mealPlan?._id || mealPlan?.id, tookMs: Date.now() - tStart }
    });
    
    res.json({
      shoppingList,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating shopping list:', error);
    await logEvent({
      level: 'error',
      message: 'shoppingList:generation:error',
      user: req.user,
      meta: { error: error.message, stack: error.stack }
    });
    res.status(500).json({ message: 'Failed to generate shopping list' });
  }
});

module.exports = router;
