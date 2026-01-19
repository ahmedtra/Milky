const express = require('express');
const router = express.Router();
const FavoriteRecipe = require('../models/FavoriteRecipe');
const auth = require('../middleware/auth');
const { searchRecipes, getRecipeById } = require('../services/recipeSearch/searchService');
const geminiService = require('../services/geminiService');
const { ensureMealImage } = require('../services/leonardoService');

const allowedIngredientCategories = new Set([
  'protein', 'vegetable', 'fruit', 'grain', 'dairy', 'fat',
  'spice', 'nut', 'seed', 'broth', 'herb', 'other'
]);

const ensureNutritionDefaults = (nut = {}) => {
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    calories: num(nut.calories, 320),
    protein: num(nut.protein, 25),
    carbs: num(nut.carbs, 28),
    fat: num(nut.fat, 12),
    fiber: num(nut.fiber, 4),
    sugar: num(nut.sugar, 6),
  };
};

const sanitizeCategory = (cat) => {
  if (!cat || typeof cat !== 'string') return 'other';
  const lower = cat.toLowerCase();
  return allowedIngredientCategories.has(lower) ? lower : 'other';
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
          // If the ingredient is a plain string, keep it as the name only to avoid "1 unit" prefixes
          ...(typeof ing === 'string'
            ? { name: ing, amount: '', unit: '' }
            : {
                name: ing.name || ing,
                amount: ing.amount || ing.quantity || '',
                unit: ing.unit || ing.measure || '',
              }),
          category: sanitizeCategory(ing.category)
        }))
      : [];

  const instructions = (() => {
    if (!hit.instructions) return [];
    if (Array.isArray(hit.instructions)) {
      return hit.instructions
        .flatMap((line) => (typeof line === 'string' ? line.split(/\r?\n/) : []))
        .map((line) => line.trim())
        .filter(Boolean);
    }
    if (typeof hit.instructions === 'string') {
      return hit.instructions
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
    return [];
  })();

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

  return {
    externalId: hit.id,
    name: hit.title || hit.name || 'Untitled recipe',
    description: hit.description || hit.summary || '',
    prepTime: Number(hit.prep_time_minutes) || Number(hit.total_time_minutes) || undefined,
    cookTime: Number(hit.cook_time_minutes) || undefined,
    servings: 1,
    image: hit.image || hit.imageUrl,
    imageUrl: hit.image || hit.imageUrl,
    ingredients,
    instructions,
    nutrition,
    tags: hit.tags || hit.dietary_tags || hit.diet_tags || [],
    difficulty: hit.difficulty || 'easy'
  };
};

router.get('/', auth, async (req, res) => {
  const favorites = await FavoriteRecipe.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .limit(20);
  res.json({ favorites });
});

// Ensure/generate image for a favorite
router.post('/:id/image', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const fav = await FavoriteRecipe.findOne({ _id: id, userId: req.user._id });
    if (!fav) return res.status(404).json({ message: 'Favorite not found' });

    // If already have an image, return quickly
    const existing = fav.image || fav.imageUrl || fav.planRecipe?.image || fav.planRecipe?.imageUrl;
    if (existing) {
      return res.json({ image: existing, favorite: fav });
    }

    const meal = { recipes: [fav.planRecipe || {}] };
    await ensureMealImage(meal, { throwOnFail: true });
    const updatedImage = meal.recipes?.[0]?.image || meal.recipes?.[0]?.imageUrl;
    if (updatedImage) {
      fav.image = updatedImage;
      fav.imageUrl = updatedImage;
      fav.planRecipe = { ...(fav.planRecipe || {}), image: updatedImage, imageUrl: updatedImage };
      await fav.save();
    }

    res.json({ image: updatedImage || null, favorite: fav });
  } catch (err) {
    console.error('❌ Error ensuring favorite image', err);
    res.status(500).json({ message: 'Failed to ensure image', error: err?.message });
  }
});

// Delete a favorite by id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await FavoriteRecipe.deleteOne({ _id: id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting favorite', err);
    res.status(500).json({ message: 'Failed to delete favorite' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { recipeId, title, recipe: recipePayload } = req.body || {};

    let source = recipePayload;
    if (!source && recipeId) {
      source = await getRecipeById(recipeId);
    }
    if (!source && title) {
      // prefer exact title match, then fuzzy
      const exact = await searchRecipes({ title_exact: title }, { size: 1 });
      const fuzzy = !exact?.results?.length
        ? await searchRecipes({ text: title }, { size: 1, randomize: false })
        : null;
      source = exact?.results?.[0] || fuzzy?.results?.[0];
    }
    if (!source && title) {
      try {
        const generated = await geminiService.generateLLMFallbackRecipes('dinner', { recipeTitle: title }, 1);
        if (generated?.length) {
          source = generated[0];
        }
      } catch (err) {
        console.warn('⚠️ Could not LLM-generate recipe for favorite', err.message);
      }
    }

    if (!source) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    const planRecipe = mapSearchHitToPlanRecipe(source);
    if (!planRecipe) {
      return res.status(400).json({ message: 'Unable to save recipe' });
    }

    // Fill missing description and nutrition, prefer LLM-generated metadata
    const needsDescription = !planRecipe.description && !planRecipe.summary;
    const hasMacro = (value) => Number(value) > 0;
    const macros = planRecipe.nutrition || {};
    const needsNutrition = !(
      hasMacro(macros.calories) &&
      hasMacro(macros.protein) &&
      hasMacro(macros.carbs) &&
      hasMacro(macros.fat)
    );

    if (needsDescription || needsNutrition) {
      try {
        const llmMeta = await geminiService.generateLLMFallbackRecipe('dinner', { recipeTitle: planRecipe.name });
        if (llmMeta) {
          if (needsDescription) {
            const descr =
              llmMeta.description ||
              llmMeta.summary ||
              (Array.isArray(llmMeta.instructions) ? llmMeta.instructions.slice(0, 2).join(' ') : null);
            if (descr) {
              planRecipe.description = descr;
              planRecipe.summary = descr;
            }
          }
          if (needsNutrition) {
            const llmNutrition = ensureNutritionDefaults(llmMeta.nutrition);
            planRecipe.nutrition = {
              ...(planRecipe.nutrition || {}),
              ...Object.fromEntries(
                Object.entries(llmNutrition).filter(([key, val]) => !hasMacro(macros[key]) && Number(val) > 0)
              )
            };
          }
        }
      } catch (metaErr) {
        console.warn('⚠️ LLM metadata generation for favorite failed:', metaErr?.message || metaErr);
      }
    }

    if (!planRecipe.description && !planRecipe.summary) {
      const instr = Array.isArray(planRecipe.instructions) ? planRecipe.instructions : [];
      const ing = Array.isArray(planRecipe.ingredients) ? planRecipe.ingredients : [];
      const snippet = instr.length ? instr.slice(0, 2).join(' ') : ing.slice(0, 3).map((i) => (i.name || i).toString()).join(', ');
      planRecipe.description = planRecipe.description || snippet || `Favorite recipe: ${planRecipe.name}`;
      planRecipe.summary = planRecipe.summary || planRecipe.description;
    }
    planRecipe.nutrition = ensureNutritionDefaults(planRecipe.nutrition);

    const calories = planRecipe?.nutrition?.calories;
    const protein = planRecipe?.nutrition?.protein;
    const totalTime = planRecipe?.prepTime || planRecipe?.cookTime;
    const image = planRecipe?.image || planRecipe?.imageUrl;

    // Always create a new favorite (no overwrite)
    const favorite = await FavoriteRecipe.create({
      userId: req.user._id,
      title: planRecipe.name,
      externalId: planRecipe.externalId,
      summary: planRecipe.description,
      image,
      imageUrl: image,
      calories,
      protein,
      totalTime,
      tags: planRecipe.tags || [],
      planRecipe
    });

    // If no image, try to generate one
    if (!favorite.image && !favorite.imageUrl) {
      try {
        console.log("🎨 Generating image for favorite", { id: favorite._id.toString(), title: favorite.title });
        const meal = { recipes: [favorite.planRecipe || {}] };
        await ensureMealImage(meal, { throwOnFail: false });
        const updatedImage = meal.recipes?.[0]?.image || meal.recipes?.[0]?.imageUrl;
        if (updatedImage) {
          favorite.image = updatedImage;
          favorite.imageUrl = updatedImage;
          favorite.planRecipe = { ...(favorite.planRecipe || {}), image: updatedImage, imageUrl: updatedImage };
          await favorite.save();
          console.log("✅ Favorite image set", { id: favorite._id.toString() });
        } else {
          console.log("ℹ️ Favorite image generation returned no URL", { id: favorite._id.toString() });
        }
      } catch (imgErr) {
        console.warn('⚠️ Could not generate image for favorite:', imgErr?.message);
      }
    } else {
      console.log("ℹ️ Favorite already has image", { id: favorite._id.toString() });
    }

    res.json({ favorite });
  } catch (err) {
    console.error('❌ Error saving favorite', err);
    res.status(500).json({ message: 'Failed to save favorite' });
  }
});

module.exports = router;
