const { GoogleGenerativeAI } = require('@google/generative-ai');

let geminiModel = null;

const getModel = () => {
  if (geminiModel) return geminiModel;
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is not set; Gemini fallback for query parsing will be disabled.');
    return null;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  return geminiModel;
};

const extractJson = (text) => {
  if (!text) return null;
  // Strip markdown fences if present
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  // Fallback to first JSON object in string
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
};

const mapQueryToFiltersWithGemini = async (query, partialFilters = {}) => {
  const model = getModel();
  if (!model) return { filters: {}, usedLLM: false, confidence: 0 };

  const prompt = `
You map free-text food preferences to structured recipe search filters.
Return ONLY JSON with this shape:
{
  "dietary_tags": ["keto","vegan","vegetarian","pescatarian","gluten_free","dairy_free"],
  "include_ingredients": ["chicken", "broccoli"],
  "exclude_ingredients": ["peanut", "shellfish"],
  "meal_type": "breakfast|lunch|dinner|snack|null",
  "cuisine": "italian|mexican|mediterranean|indian|asian|middle_eastern|american|french|greek|thai|vietnamese|korean|null",
  "max_prep_time_minutes": 30,
  "calorie_target": 600,
  "macro_focus": "high_protein|low_carb|balanced|null",
  "notes": "free text rationale (short)"
}

Use null when unknown. Do NOT invent ingredients that are not present in the user request. Keep ingredient tokens normalized (lowercase, singular if clear).
Partial filters from deterministic parsing: ${JSON.stringify(partialFilters)}
User request: "${query}"
  `.trim();

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }]}],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 300
    }
  });

  const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  const jsonString = extractJson(text);

  if (!jsonString) {
    return { filters: {}, usedLLM: true, confidence: 0.6 };
  }

  try {
    const parsed = JSON.parse(jsonString);
    return {
      filters: parsed,
      usedLLM: true,
      confidence: 0.9
    };
  } catch (error) {
    console.warn('Gemini parse error; falling back to deterministic filters only:', error.message);
    return { filters: {}, usedLLM: true, confidence: 0.6 };
  }
};

module.exports = {
  mapQueryToFiltersWithGemini
};
