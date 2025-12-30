#!/usr/bin/env node
/**
 * Normalize the HuggingFace CookingRecipes dataset (or compatible JSON/NDJSON)
 * and index it into Elasticsearch.
 *
 * Usage:
 *   node server/scripts/preprocessAndIndexRecipes.js --source data/raw/recipes.jsonl --index recipes
 *   node server/scripts/preprocessAndIndexRecipes.js --source data/raw/recipes.csv --index recipes
 *
 * Flags:
 *   --batch-size 500    (how many docs per bulk request)
 *   --limit 10000       (optional max docs to index, for testing)
 *
 * Required env:
 *   ELASTICSEARCH_NODE=http://localhost:9200
 *   GEMINI_API_KEY (not needed for indexing)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parse } = require('csv-parse');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { client, recipeIndex: defaultIndex } = require('../services/recipeSearch/elasticsearchClient');
const { ensureRecipeIndex } = require('../services/recipeSearch/indexManagement');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1];
};

const sourcePath = getArg('source') || process.env.RECIPE_SOURCE_PATH;
const targetIndex = getArg('index') || defaultIndex;
const batchSize = Number(getArg('batch-size') || process.env.RECIPE_BATCH_SIZE || 500);
const maxDocs = Number(getArg('limit') || process.env.RECIPE_LIMIT || 0);

if (!sourcePath) {
  console.error('❌ Please provide --source <path-to-json-or-jsonl> or set RECIPE_SOURCE_PATH');
  process.exit(1);
}

const toNumber = (value) => {
  const num = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : null;
};

const stripJsonComments = (input) => {
  if (typeof input !== 'string') return input;
  // Remove // line comments and /* block comments */
  return input
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
};

const normalizeIngredient = (ingredient) => {
  if (!ingredient) return null;
  return String(ingredient)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(diced|chopped|minced|fresh|frozen|organic|large|small|medium)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const dedupe = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const parseArrayField = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') {
    const trimmed = stripJsonComments(val.trim());
    if (!trimmed) return [];
    // Try JSON.parse directly
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (e) {
      // Try lenient parse by swapping single quotes to double quotes
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (err) {
        // Fallback: split on comma/semicolon
        return trimmed
          .split(/[,;]\s*/)
          .map((s) => s.replace(/^["']|["']$/g, '').trim())
          .filter(Boolean);
      }
    }
  }
  return [];
};

const allergenMap = {
  peanut: ['peanut'],
  tree_nut: ['almond', 'walnut', 'pecan', 'cashew', 'hazelnut'],
  dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt'],
  egg: ['egg'],
  gluten: ['wheat', 'barley', 'rye', 'flour', 'pasta', 'bread'],
  soy: ['soy', 'tofu', 'soybean', 'soy sauce', 'edamame'],
  fish: ['salmon', 'tuna', 'cod', 'trout'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel'],
  sesame: ['sesame', 'tahini']
};

const detectAllergens = (ingredients) => {
  const allergens = new Set();
  ingredients.forEach((ing) => {
    Object.entries(allergenMap).forEach(([allergen, tokens]) => {
      if (tokens.some((t) => ing.includes(t))) allergens.add(allergen);
    });
  });
  return Array.from(allergens);
};

const bucketCalories = (calories) => {
  if (!calories) return null;
  if (calories < 350) return 'low';
  if (calories < 650) return 'medium';
  return 'high';
};

const bucketProtein = (protein) => {
  if (!protein) return null;
  if (protein < 15) return 'low';
  if (protein < 30) return 'moderate';
  return 'high';
};

const inferMealType = (raw) => {
  const text = [raw.title, raw.description].filter(Boolean).join(' ').toLowerCase();
  if (raw.meal_type) return raw.meal_type.toLowerCase();
  if (/breakfast|brunch|morning/.test(text)) return 'breakfast';
  if (/lunch/.test(text)) return 'lunch';
  if (/snack|bites/.test(text)) return 'snack';
  if (/dinner|supper/.test(text)) return 'dinner';
  return null;
};

const normalizeCuisine = (rawCuisine) => {
  if (!rawCuisine) return null;
  return String(rawCuisine).toLowerCase().replace(/\s+/g, '_');
};

const transformRecipe = (raw) => {
  const ingredientsRaw = parseArrayField(raw.ingredients || raw.ingredient_list);
  const ingredients_norm = dedupe(ingredientsRaw.map(normalizeIngredient).filter(Boolean));

  const calories = toNumber(raw.calories || raw.calorie || raw.kcal || raw.nutrition?.calories);
  const protein_grams = toNumber(raw.protein || raw.nutrition?.protein);
  const prep_time_minutes = toNumber(raw.prep_time_minutes || raw.prep_time || raw.time?.prep);
  const cook_time_minutes = toNumber(raw.cook_time_minutes || raw.cook_time || raw.time?.cook);

  const directions = parseArrayField(raw.directions || raw.instructions);
  const instructions = directions.length ? directions.join('\n') : (raw.instructions || raw.directions || '');

  const doc = {
    title: raw.title || raw.name || 'Untitled recipe',
    description: raw.description || raw.summary || '',
    cuisine: normalizeCuisine(raw.cuisine || raw.cuisine_type),
    meal_type: inferMealType(raw),
    dietary_tags: dedupe(raw.dietary_tags || raw.tags || raw.diets || []),
    ingredients_norm,
    ingredients_raw: ingredientsRaw.join(', '),
    allergens: detectAllergens(ingredients_norm),
    calories,
    calories_bucket: bucketCalories(calories),
    protein_grams,
    protein_bucket: bucketProtein(protein_grams),
    prep_time_minutes,
    cook_time_minutes,
    total_time_minutes: toNumber(raw.total_time_minutes || raw.total_time || (prep_time_minutes || 0) + (cook_time_minutes || 0)),
    instructions,
    tags: dedupe(raw.tags || []),
    source: raw.source || raw.source_domain || 'huggingface:CodeKapital/CookingRecipes',
    url: raw.url || raw.link,
    ner: parseArrayField(raw.ner || raw.NER).map((n) => String(n).toLowerCase()),
    created_at: new Date().toISOString()
  };

  return doc;
};

const streamJsonl = async (filePath, onRow) => {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      await onRow(parsed);
    } catch (error) {
      console.warn('Skipping invalid JSON line:', error.message);
    }
  }
};

const processArrayFile = async (filePath, onRow) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(stripJsonComments(content));
  if (!Array.isArray(parsed)) {
    throw new Error('Expected an array in the source file');
  }
  for (const item of parsed) {
    await onRow(item);
  }
};

const processCsvFile = async (filePath, onRow) => {
  const stream = fs.createReadStream(filePath);
  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    })
  );

  for await (const record of parser) {
    await onRow(record);
  }
};

const bulkIndex = async (documents) => {
  await client.helpers.bulk({
    datasource: documents,
    flushBytes: 5 * 1024 * 1024,
    concurrency: 2,
    onDocument(doc) {
      return { index: { _index: targetIndex } };
    },
    refresh: true,
    onDrop(doc, error) {
      console.error('Dropped doc during bulk index:', error, doc.title);
    }
  });
};

const main = async () => {
  console.log(`ℹ️ Starting preprocessing for ${sourcePath}`);
  await ensureRecipeIndex(targetIndex);

  let count = 0;
  const batch = [];
  const flushBatch = async () => {
    if (!batch.length) return;
    const toSend = [...batch];
    batch.length = 0;
    await bulkIndex(toSend);
  };

  const handleRow = async (row) => {
    const doc = transformRecipe(row);
    batch.push(doc);
    count += 1;
    if (batch.length >= batchSize) {
      await flushBatch();
      console.log(`📦 Indexed ${count} recipes so far...`);
    }
    if (maxDocs && count >= maxDocs) {
      throw new Error('REACHED_LIMIT');
    }
  };

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.jsonl' || ext === '.ndjson') {
    await streamJsonl(sourcePath, handleRow);
  } else if (ext === '.csv') {
    await processCsvFile(sourcePath, handleRow);
  } else {
    await processArrayFile(sourcePath, handleRow);
  }

  await flushBatch();
  console.log(`✅ Finished. Indexed ${count} recipes into "${targetIndex}".`);
  process.exit(0);
};

main().catch((error) => {
  if (error && error.message === 'REACHED_LIMIT') {
    console.log(`⏹️ Stopped early after reaching limit of ${maxDocs} docs.`);
    process.exit(0);
  }
  console.error('❌ Preprocessing/indexing failed:', error);
  process.exit(1);
});
