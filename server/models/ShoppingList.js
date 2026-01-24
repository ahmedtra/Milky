const mongoose = require('mongoose');

const shoppingItemSchema = new mongoose.Schema({
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
  unitType: {
    type: String,
    enum: ['weight', 'volume', 'count', 'other'],
    default: 'other'
  },
  unitVariants: [
    {
      amount: String,
      unit: String
    }
  ],
  category: {
    type: String,
    enum: ['produce', 'meat', 'dairy', 'pantry', 'frozen', 'bakery', 'beverages', 'other'],
    default: 'other'
  },
  purchased: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  estimatedPrice: Number,
  notes: String
});

const shoppingListSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mealPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MealPlan',
    required: false
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  items: [shoppingItemSchema],
  status: {
    type: String,
    enum: ['draft', 'active', 'completed'],
    default: 'draft'
  },
  totalEstimatedCost: Number,
  store: String,
  notes: String,
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
shoppingListSchema.index({ userId: 1, status: 1 });
shoppingListSchema.index({ mealPlanId: 1 });

module.exports = mongoose.model('ShoppingList', shoppingListSchema);
