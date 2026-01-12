const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ShoppingList = require('../models/ShoppingList');
const MealPlan = require('../models/MealPlan');
const geminiService = require('../services/geminiService');
const auth = require('../middleware/auth');

const categoryMap = {
  protein: 'meat',
  vegetable: 'produce',
  fruit: 'produce',
  grain: 'pantry',
  dairy: 'dairy',
  fat: 'pantry',
  spice: 'pantry',
  nut: 'pantry',
  seed: 'pantry',
  other: 'other'
};

const categorizeName = (name = '') => {
  const lower = String(name).toLowerCase();
  if (/(chicken|beef|turkey|pork|salmon|fish|shrimp|meat)/.test(lower)) return 'meat';
  if (/(milk|yogurt|cheese|butter|cream)/.test(lower)) return 'dairy';
  if (/(apple|banana|berry|orange|fruit|grape)/.test(lower)) return 'produce';
  if (/(lettuce|spinach|kale|broccoli|carrot|pepper|onion|garlic|tomato|potato)/.test(lower)) return 'produce';
  if (/(bread|baguette|bun|bagel)/.test(lower)) return 'bakery';
  if (/(rice|pasta|flour|sugar|salt|oil|spice|canned|grain)/.test(lower)) return 'pantry';
  if (/(frozen|ice cream)/.test(lower)) return 'frozen';
  return 'other';
};

const defaultAmountUnit = (raw) => {
  const str = String(raw || '').trim();
  if (!str) return { amount: '1', unit: 'unit' };
  const m = str.match(/^(\d+(?:\.\d+)?)(?:\s+(.*))?$/);
  return { amount: m ? m[1] : '1', unit: m && m[2] ? m[2].trim() : 'unit' };
};

const toNumber = (val, fallback = 0) => {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : fallback;
};

const computeTotal = (items = []) =>
  items.reduce((sum, item) => sum + toNumber(item.price, 0), 0);

// Ask LLM to enrich missing category/price when heuristics leave "other" or price is missing
const enrichWithLLM = async (items) => {
  const needsEnrichment = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.category || item.category === 'other' || item.price === 0 || item.price === undefined || item.price === null);
  if (!needsEnrichment.length) return items;
  try {
    const payload = needsEnrichment.map(({ item }) => ({
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      category: item.category || 'other',
      price: item.price || 0
    }));
    const prompt = `
    Infer shopping metadata for these items. Return ONLY JSON array with objects:
    [
      { "name": "string", "amount": "string", "unit": "string", "category": "produce|meat|dairy|bakery|pantry|frozen|beverages|other", "price": number }
    ]
    Keep order. Use reasonable grocery prices in USD (positive numbers); only use 0 if truly unknown. If unsure on category, set to "other".
    Items: ${JSON.stringify(payload, null, 2)}
    `;
    const text = await geminiService.callTextModel(prompt, 0.2, 'json');
    const jsonMatch = text && text.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    if (Array.isArray(parsed)) {
      parsed.forEach((meta, i) => {
        const target = needsEnrichment[i];
        if (!target) return;
        const idx = target.idx;
        items[idx] = {
          ...items[idx],
          category: meta?.category || items[idx].category || 'other',
          price: toNumber(meta?.price, items[idx].price || 0),
          amount: meta?.amount || items[idx].amount,
          unit: meta?.unit || items[idx].unit
        };
      });
      console.log('LLM shopping enrichment result (price/category):', parsed.map((m) => ({
        name: m?.name,
        price: m?.price,
        category: m?.category
      })));
    }
  } catch (err) {
    console.warn('⚠️ LLM enrichment for shopping items failed:', err.message);
  }
  return items;
};

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
    const { mealPlanId, title, description, items, store, totalEstimatedCost } = req.body;

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

  // Ask LLM to enrich missing category/price when heuristics leave "other" or price is missing
  const enrichWithLLM = async (items) => {
    const needsEnrichment = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.category || item.category === 'other' || item.price === 0 || item.price === undefined || item.price === null);
    if (!needsEnrichment.length) return items;
    try {
      const payload = needsEnrichment.map(({ item }) => ({
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category || 'other',
        price: item.price || 0
      }));
      const prompt = `
      Infer shopping metadata for these items. Return ONLY JSON array with objects:
      [
        { "name": "string", "amount": "string", "unit": "string", "category": "produce|meat|dairy|bakery|pantry|frozen|beverages|other", "price": number }
      ]
      Keep order. Use reasonable grocery prices in USD (positive numbers); only use 0 if truly unknown. If unsure on category, set to "other".
      Items: ${JSON.stringify(payload, null, 2)}
      `;
      const text = await geminiService.callTextModel(prompt, 0.2, 'json');
      const jsonMatch = text && text.match(/\[[\s\S]*\]/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
      if (Array.isArray(parsed)) {
        parsed.forEach((meta, i) => {
          const target = needsEnrichment[i];
          if (!target) return;
          const idx = target.idx;
          items[idx] = {
            ...items[idx],
            category: meta?.category || items[idx].category || 'other',
            price: toNumber(meta?.price, items[idx].price || 0),
            amount: meta?.amount || items[idx].amount,
            unit: meta?.unit || items[idx].unit
          };
        });
        console.log('LLM shopping enrichment result (price/category):', parsed.map((m) => ({
          name: m?.name,
          price: m?.price,
          category: m?.category
        })));
      }
    } catch (err) {
      console.warn('⚠️ LLM enrichment for shopping items failed:', err.message);
    }
    return items;
  };

    let sanitizedItems = items.map(item => {
      const mappedCategory = categoryMap[item.category?.toLowerCase()] || item.category || categorizeName(item.name);
      const { amount, unit } = defaultAmountUnit(item.amount || item.quantity);
      return {
        ...item,
        amount,
        unit,
        price: typeof item.price === 'number' ? item.price : 0,
        purchased: Boolean(item.purchased),
        category: mappedCategory
      };
    });
    sanitizedItems = await enrichWithLLM(sanitizedItems);
    console.log('Sanitized items:', sanitizedItems);
    const allPurchased = sanitizedItems.length > 0 && sanitizedItems.every((i) => i.purchased);
    const estimatedTotal = typeof totalEstimatedCost === 'number'
      ? totalEstimatedCost
      : computeTotal(sanitizedItems);

    const shoppingList = new ShoppingList({
      userId: req.user._id,
      mealPlanId: validMealPlanId,
      title,
      description,
      items: sanitizedItems,
      store,
      totalEstimatedCost: estimatedTotal,
      status: allPurchased ? 'completed' : 'active'
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
    const { title, description, items, status, store, notes, totalEstimatedCost } = req.body;

    const shoppingList = await ShoppingList.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    if (title) shoppingList.title = title;
    if (description) shoppingList.description = description;
    if (items) {
      let mappedItems = items.map(item => {
        const mappedCategory = categoryMap[item.category?.toLowerCase()] || item.category || categorizeName(item.name);
        const { amount, unit } = defaultAmountUnit(item.amount || item.quantity);
        return {
          ...item,
          amount,
          unit,
          price: typeof item.price === 'number' ? item.price : 0,
          purchased: Boolean(item.purchased),
          category: mappedCategory
        };
      });
      mappedItems = await enrichWithLLM(mappedItems);
      shoppingList.items = mappedItems;

      // Recompute total if not explicitly provided
      if (totalEstimatedCost === undefined || totalEstimatedCost === null) {
        shoppingList.totalEstimatedCost = computeTotal(mappedItems);
      }
    }
    if (status) shoppingList.status = status;
    if (store) shoppingList.store = store;
    if (notes) shoppingList.notes = notes;
    if (totalEstimatedCost !== undefined && totalEstimatedCost !== null) {
      shoppingList.totalEstimatedCost = totalEstimatedCost;
    } else if (shoppingList.items) {
      shoppingList.totalEstimatedCost = computeTotal(shoppingList.items);
    }

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

    // auto-update status based on completion
    const allPurchased = shoppingList.items.length > 0 && shoppingList.items.every((i) => i.purchased);
    shoppingList.status = allPurchased ? 'completed' : 'active';

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
    // auto-update status based on completion
    const allPurchased = shoppingList.items.length > 0 && shoppingList.items.every((i) => i.purchased);
    shoppingList.status = allPurchased ? 'completed' : 'active';

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

// Delete all shopping lists for the user (optionally filtered by status)
router.delete('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.user._id };

    if (status) {
      filter.status = status;
    }

    const result = await ShoppingList.deleteMany(filter);

    res.json({
      message: `${result.deletedCount} shopping list${result.deletedCount === 1 ? '' : 's'} cleared successfully`,
      deleted: result.deletedCount
    });
  } catch (error) {
    console.error('Clear shopping lists error:', error);
    res.status(500).json({ message: 'Server error clearing shopping lists' });
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
