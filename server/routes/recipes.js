const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { parseQueryToFilters } = require('../services/recipeSearch/queryParser');
const { searchRecipes } = require('../services/recipeSearch/searchService');
const { ensureConnection, recipeIndex } = require('../services/recipeSearch/elasticsearchClient');

// Optional embedding helper to build a query_vector from free text
const EMBED_HOST = process.env.EMBEDDING_HOST || process.env.OLLAMA_HOST || 'http://localhost:11434';
// Default to a 768-dim model to match mapping
const EMBED_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const buildQueryVector = async (text) => {
  if (!text) return null;
  try {
    const res = await fetch(`${EMBED_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
    });
    if (!res.ok) throw new Error(`Embedding failed ${res.status}`);
    const data = await res.json();
    return data?.embedding || null;
  } catch (err) {
    console.warn('⚠️ Query embedding failed:', err.message);
    return null;
  }
};

router.get('/status', auth, async (req, res) => {
  try {
    await ensureConnection();
    res.json({ status: 'ok', index: recipeIndex });
  } catch (error) {
    res.status(503).json({ status: 'unreachable', error: error.message });
  }
});

router.post('/search', auth, async (req, res) => {
  try {
    const { query = '', filters = {}, size } = req.body || {};

    const parsed = await parseQueryToFilters(query, filters);
    // Build a query vector from the user text to enable hybrid vector+filter search
    const queryVector = await buildQueryVector(query || parsed.filters?.text);
    const filtersWithVector = queryVector ? { ...parsed.filters, query_vector: queryVector } : parsed.filters;

    const results = await searchRecipes(filtersWithVector, { size });

    res.json({
      ...results,
      filters: filtersWithVector,
      confidence: parsed.confidence,
      usedLLM: parsed.usedLLM
    });
  } catch (error) {
    console.error('Recipe search failed:', error);
    res.status(500).json({ message: 'Recipe search failed', error: error.message });
  }
});

module.exports = router;
