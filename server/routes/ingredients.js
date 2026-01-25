const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getIngredientImageIfExists, ensureIngredientImage } = require('../services/leonardoService');

const UNIT_WORDS = new Set([
  'cup', 'cups', 'c', 'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters',
  'clove', 'cloves', 'slice', 'slices', 'can', 'cans', 'pkg', 'package', 'packages', 'unit', 'units'
]);

const PREP_WORDS = new Set([
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed',
  'fresh', 'frozen', 'canned', 'drained', 'peeled', 'seeded', 'seedless',
  'boneless', 'skinless', 'cooked', 'beaten', 'large', 'small', 'medium'
]);
const STOP_WORDS = new Set([
  'and', 'or', 'with', 'of', 'the', 'a', 'an', 'to', 'for', 'in', 'on', 'at',
  'optional', 'taste', 'serving', 'as', 'needed'
]);
const ALIAS_MAP = new Map([
  ['scallion', 'green onion'],
  ['spring onion', 'green onion'],
  ['capsicum', 'bell pepper'],
  ['coriander', 'cilantro'],
  ['garbanzo', 'chickpea'],
  ['aubergine', 'eggplant'],
  ['courgette', 'zucchini'],
  ['rocket', 'arugula'],
  ['confectioners sugar', 'powdered sugar'],
  ['caster sugar', 'sugar'],
  ['mince', 'ground'],
  ['ground beef', 'beef'],
  ['ground turkey', 'turkey'],
  ['ground chicken', 'chicken'],
  ['ground pork', 'pork'],
]);

const normalizeWhitespace = (val) => String(val || '').trim().replace(/\s+/g, ' ');

const stripLeadingQuantity = (val) => {
  const str = normalizeWhitespace(val).toLowerCase();
  return str.replace(/^\s*(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|\d+\s+\d+\s*\/\s*\d+)(?:\s+|$)/, '');
};

const stripUnits = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  const cleaned = tokens.filter((token) => !UNIT_WORDS.has(token));
  return cleaned.join(' ').trim();
};

const stripParentheticals = (val) => String(val || '').replace(/\([^)]*\)/g, ' ');

const stripTrailingNotes = (val) => {
  const str = normalizeWhitespace(val);
  const parts = str.split(',');
  return parts.length > 1 ? parts[0] : str;
};

const removePrepWords = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  const cleaned = tokens.filter((token) => !PREP_WORDS.has(token));
  return cleaned.join(' ').trim();
};

const stripNumbers = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  const cleaned = tokens.filter((token) => !/^\d+(?:[\/.-]\d+)?$/.test(token));
  return cleaned.join(' ').trim();
};

const dropStopWords = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  const cleaned = tokens.filter((token) => !STOP_WORDS.has(token));
  return cleaned.join(' ').trim();
};

const singularize = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  const cleaned = tokens.map((token) => (token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token));
  return cleaned.join(' ').trim();
};

const stripTrailingS = (val) => {
  const str = normalizeWhitespace(val).toLowerCase();
  return str.endsWith('s') && str.length > 3 ? str.slice(0, -1) : str;
};

const sortTokens = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  return tokens.sort().join(' ').trim();
};

const expandAliases = (val) => {
  const lower = normalizeWhitespace(val).toLowerCase();
  const candidates = [];
  for (const [key, alias] of ALIAS_MAP.entries()) {
    if (lower.includes(key)) {
      candidates.push(alias);
    }
  }
  return candidates;
};

const pickHeadNouns = (val) => {
  const tokens = normalizeWhitespace(val).toLowerCase().split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const last = tokens[tokens.length - 1];
  const lastTwo = tokens.length > 1 ? `${tokens[tokens.length - 2]} ${last}` : '';
  const lastThree = tokens.length > 2 ? `${tokens[tokens.length - 3]} ${lastTwo}` : '';
  return [lastThree, lastTwo, last].filter(Boolean);
};

const buildCandidates = (raw) => {
  const original = normalizeWhitespace(raw);
  if (!original) return [];
  const base = stripTrailingNotes(stripParentheticals(original));
  const noQty = stripLeadingQuantity(base);
  const noUnits = stripUnits(noQty);
  const cleaned = normalizeWhitespace(noUnits || noQty || base);
  const noPrep = removePrepWords(cleaned);
  const noNums = stripNumbers(noPrep);
  const noStop = dropStopWords(noNums);
  const singular = singularize(noStop);
  const singularBare = stripTrailingS(singular);
  const sorted = sortTokens(singular);
  const heads = pickHeadNouns(singular);
  const aliases = expandAliases(singular);
  const candidates = [
    cleaned,
    noPrep,
    noStop,
    singular,
    singularBare,
    sorted,
    ...heads,
    ...aliases,
    base,
    original
  ]
    .map((val) => normalizeWhitespace(val))
    .filter(Boolean);
  return Array.from(new Set(candidates));
};

const buildNormalizedName = (raw) => {
  const original = normalizeWhitespace(raw);
  if (!original) return '';
  const base = stripTrailingNotes(stripParentheticals(original));
  const noQty = stripLeadingQuantity(base);
  const noUnits = stripUnits(noQty);
  const cleaned = normalizeWhitespace(noUnits || noQty || base);
  const noPrep = removePrepWords(cleaned);
  const noNums = stripNumbers(noPrep);
  const noStop = dropStopWords(noNums);
  return singularize(noStop);
};

router.post('/resolve-images', auth, async (req, res) => {
  try {
    const { ingredients } = req.body || {};
    if (!Array.isArray(ingredients)) {
      return res.status(400).json({ message: 'ingredients array is required' });
    }

    const images = await Promise.all(ingredients.map(async (raw) => {
      const normalized = buildNormalizedName(raw);
      if (normalized) {
        console.log('🧩 Ingredient normalized name', { raw, normalized });
      } else {
        console.log('🧩 Ingredient normalized name empty', { raw });
      }
      const candidates = buildCandidates(raw);
      for (const candidate of candidates) {
        const imageUrl = await getIngredientImageIfExists(candidate);
        if (imageUrl) {
          return { imageUrl, matchedName: candidate };
        }
      }
      const fallbackName = normalized || normalizeWhitespace(raw);
      if (fallbackName) {
        try {
          const generatedUrl = await ensureIngredientImage(fallbackName);
          if (generatedUrl) {
            return { imageUrl: generatedUrl, matchedName: fallbackName };
          }
        } catch (err) {
          console.warn('⚠️ Ingredient image generation failed:', err.message);
        }
      }
      return { imageUrl: null, matchedName: fallbackName || null };
    }));

    res.json({ images });
  } catch (error) {
    console.error('Resolve ingredient images error:', error);
    res.status(500).json({ message: 'Server error resolving ingredient images' });
  }
});

module.exports = router;
