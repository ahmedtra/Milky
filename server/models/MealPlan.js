const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  amount: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['protein', 'vegetable', 'fruit', 'grain', 'dairy', 'fat', 'spice', 'other'],
    default: 'other'
  }
});

const recipeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  prepTime: Number, // in minutes
  cookTime: Number, // in minutes
  servings: {
    type: Number,
    default: 1
  },
  ingredients: [ingredientSchema],
  instructions: [String],
  nutrition: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
    fiber: Number,
    sugar: Number
  },
  tags: [String],
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'easy'
  }
});

const mealSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    required: true
  },
  scheduledTime: {
    type: String, // HH:MM format
    required: true
  },
  recipes: [recipeSchema],
  totalNutrition: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number
  },
  notes: String
});

const mealPlanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  days: [{
    date: {
      type: Date,
      required: true
    },
    meals: [mealSchema]
  }],
  totalNutrition: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'archived'],
    default: 'draft'
  },
  generatedBy: {
    type: String,
    enum: ['gemini-ai', 'manual', 'template'],
    default: 'gemini-ai'
  },
  tags: [String]
}, {
  timestamps: true
});

// Index for efficient querying
mealPlanSchema.index({ userId: 1, startDate: 1 });
mealPlanSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('MealPlan', mealPlanSchema);

