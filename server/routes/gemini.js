const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const auth = require('../middleware/auth');

// Chat with dietitian
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const response = await geminiService.chatWithDietitian(message, conversationHistory);
    
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
    const { duration = 7, preferences } = req.body;
    
    if (!preferences) {
      return res.status(400).json({ message: 'User preferences are required' });
    }

    const mealPlan = await geminiService.generateMealPlan(preferences, duration);
    
    res.json({
      mealPlan,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating meal plan:', error);
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

    const shoppingList = await geminiService.generateShoppingList(mealPlan);
    
    res.json({
      shoppingList,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating shopping list:', error);
    res.status(500).json({ message: 'Failed to generate shopping list' });
  }
});

module.exports = router;

