const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ShoppingList = require('../models/ShoppingList');
const MealPlan = require('../models/MealPlan');
const auth = require('../middleware/auth');

// Get all shopping lists for user
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { userId: req.user._id };
    if (status) {
      query.status = status;
    }

    const shoppingLists = await ShoppingList.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('mealPlanId', 'title description');

    const total = await ShoppingList.countDocuments(query);

    res.json({
      shoppingLists,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get shopping lists error:', error);
    res.status(500).json({ message: 'Server error fetching shopping lists' });
  }
});

// Get specific shopping list
router.get('/:id', auth, async (req, res) => {
  try {
    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('mealPlanId', 'title description');

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    res.json({ shoppingList });
  } catch (error) {
    console.error('Get shopping list error:', error);
    res.status(500).json({ message: 'Server error fetching shopping list' });
  }
});

// Create new shopping list
router.post('/', auth, async (req, res) => {
  try {
    const { mealPlanId, title, description, items, store } = req.body;

    if (!title || !items || !Array.isArray(items)) {
      return res.status(400).json({ 
        message: 'Title and items array are required' 
      });
    }

    // Handle invalid mealPlanId formats (numeric IDs from localStorage)
    let validMealPlanId = null;
    if (mealPlanId) {
      const candidateId = String(mealPlanId).trim();
      const looksLikeObjectId = candidateId.length === 24 && mongoose.Types.ObjectId.isValid(candidateId);

      if (looksLikeObjectId) {
        validMealPlanId = candidateId;
      } else {
        console.log(`Invalid mealPlanId format: ${mealPlanId}, setting to null`);
      }
    }

    // Verify meal plan belongs to user (only if mealPlanId is a valid ObjectId)
    if (validMealPlanId) {
      const mealPlan = await MealPlan.findOne({
        _id: validMealPlanId,
        userId: req.user._id
      });

      if (!mealPlan) {
        return res.status(404).json({ message: 'Meal plan not found' });
      }
    }

    const shoppingList = new ShoppingList({
      userId: req.user._id,
      mealPlanId: validMealPlanId,
      title,
      description,
      items,
      store,
      status: 'draft'
    });

    await shoppingList.save();

    res.status(201).json({
      message: 'Shopping list created successfully',
      shoppingList
    });
  } catch (error) {
    console.error('Create shopping list error:', error);
    res.status(500).json({ message: 'Server error creating shopping list' });
  }
});

// Update shopping list
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, description, items, status, store, notes } = req.body;

    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    if (title) shoppingList.title = title;
    if (description) shoppingList.description = description;
    if (items) shoppingList.items = items;
    if (status) shoppingList.status = status;
    if (store) shoppingList.store = store;
    if (notes) shoppingList.notes = notes;

    await shoppingList.save();

    res.json({
      message: 'Shopping list updated successfully',
      shoppingList
    });
  } catch (error) {
    console.error('Update shopping list error:', error);
    res.status(500).json({ message: 'Server error updating shopping list' });
  }
});

// Update shopping list item
router.put('/:id/items/:itemId', auth, async (req, res) => {
  try {
    const { purchased, priority, notes } = req.body;

    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    const item = shoppingList.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (purchased !== undefined) item.purchased = purchased;
    if (priority) item.priority = priority;
    if (notes) item.notes = notes;

    await shoppingList.save();

    res.json({
      message: 'Item updated successfully',
      item
    });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ message: 'Server error updating item' });
  }
});

// Add item to shopping list
router.post('/:id/items', auth, async (req, res) => {
  try {
    const { name, amount, unit, category, priority = 'medium', notes } = req.body;

    if (!name || !amount || !unit) {
      return res.status(400).json({ 
        message: 'Name, amount, and unit are required' 
      });
    }

    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    const newItem = {
      name,
      amount,
      unit,
      category: category || 'other',
      priority,
      notes
    };

    shoppingList.items.push(newItem);
    await shoppingList.save();

    res.json({
      message: 'Item added successfully',
      item: shoppingList.items[shoppingList.items.length - 1]
    });
  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({ message: 'Server error adding item' });
  }
});

// Remove item from shopping list
router.delete('/:id/items/:itemId', auth, async (req, res) => {
  try {
    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    const item = shoppingList.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    item.remove();
    await shoppingList.save();

    res.json({ message: 'Item removed successfully' });
  } catch (error) {
    console.error('Remove item error:', error);
    res.status(500).json({ message: 'Server error removing item' });
  }
});

// Mark all items as purchased/unpurchased
router.put('/:id/toggle-all', auth, async (req, res) => {
  try {
    const { purchased } = req.body;

    if (typeof purchased !== 'boolean') {
      return res.status(400).json({ message: 'Purchased must be a boolean value' });
    }

    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    shoppingList.items.forEach(item => {
      item.purchased = purchased;
    });

    await shoppingList.save();

    res.json({
      message: `All items marked as ${purchased ? 'purchased' : 'unpurchased'}`,
      shoppingList
    });
  } catch (error) {
    console.error('Toggle all items error:', error);
    res.status(500).json({ message: 'Server error toggling items' });
  }
});

// Delete shopping list
router.delete('/:id', auth, async (req, res) => {
  try {
    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    await ShoppingList.findByIdAndDelete(shoppingList._id);

    res.json({ message: 'Shopping list deleted successfully' });
  } catch (error) {
    console.error('Delete shopping list error:', error);
    res.status(500).json({ message: 'Server error deleting shopping list' });
  }
});

// Export shopping list (return formatted data)
router.get('/:id/export', auth, async (req, res) => {
  try {
    const { format = 'json' } = req.query;

    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('mealPlanId', 'title');

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    if (format === 'text') {
      let textExport = `Shopping List: ${shoppingList.title}\n`;
      textExport += `Generated: ${shoppingList.generatedAt.toDateString()}\n\n`;

      // Group items by category
      const itemsByCategory = {};
      shoppingList.items.forEach(item => {
        if (!itemsByCategory[item.category]) {
          itemsByCategory[item.category] = [];
        }
        itemsByCategory[item.category].push(item);
      });

      Object.keys(itemsByCategory).forEach(category => {
        textExport += `${category.charAt(0).toUpperCase() + category.slice(1)}:\n`;
        itemsByCategory[category].forEach(item => {
          const status = item.purchased ? '✓' : '○';
          textExport += `${status} ${item.name} - ${item.amount} ${item.unit}\n`;
        });
        textExport += '\n';
      });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="shopping-list-${shoppingList._id}.txt"`);
      res.send(textExport);
    } else {
      res.json({
        shoppingList,
        exportedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Export shopping list error:', error);
    res.status(500).json({ message: 'Server error exporting shopping list' });
  }
});

module.exports = router;
