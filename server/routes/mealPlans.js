const express = require('express');
const router = express.Router();
const MealPlan = require('../models/MealPlan');
const ShoppingList = require('../models/ShoppingList');
const geminiService = require('../services/geminiService');
const auth = require('../middleware/auth');

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
    const { duration = 7, preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({ message: 'User preferences are required' });
    }

    // Generate meal plan using Gemini AI
    const aiMealPlan = await geminiService.generateMealPlan(preferences, duration);
    
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
      status: 'draft'
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
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, description, days, status } = req.body;

    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!mealPlan) {
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    if (title) mealPlan.title = title;
    if (description) mealPlan.description = description;
    if (days) mealPlan.days = days;
    if (status) mealPlan.status = status;

    await mealPlan.save();

    res.json({
      message: 'Meal plan updated successfully',
      mealPlan
    });
  } catch (error) {
    console.error('Update meal plan error:', error);
    res.status(500).json({ message: 'Server error updating meal plan' });
  }
});

// Activate meal plan
router.post('/:id/activate', auth, async (req, res) => {
  try {
    const mealPlan = await MealPlan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!mealPlan) {
      return res.status(404).json({ message: 'Meal plan not found' });
    }

    // Deactivate other active meal plans
    await MealPlan.updateMany(
      { userId: req.user._id, status: 'active' },
      { status: 'archived' }
    );

    // Activate this meal plan
    mealPlan.status = 'active';
    await mealPlan.save();

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






