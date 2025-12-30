/**
 * Minimal Groq chat client using the OpenAI-compatible API.
 * Environment:
 *   GROQ_API_KEY (required)
 *   GROQ_MODEL (optional, default: llama-3.1-8b-instant)
 *   GROQ_BASE (optional, default: https://api.groq.com/openai/v1)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_BASE = process.env.GROQ_BASE || 'https://api.groq.com/openai/v1';

if (!GROQ_API_KEY) {
  console.warn('⚠️ GROQ_API_KEY is not set. Groq calls will fail until provided.');
}

const groqHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${GROQ_API_KEY}`
});

const groqChat = async ({
  messages,
  model = GROQ_MODEL,
  temperature = 0.2,
  maxTokens = 2048,
  responseFormat
} = {}) => {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required to call Groq');
  }

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: groqHeaders(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`Groq error ${res.status}: ${text}`);
    error.status = res.status;
    error.body = text;
    throw error;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return { content, raw: data };
};

module.exports = {
  groqChat,
  GROQ_MODEL,
  GROQ_BASE
};
