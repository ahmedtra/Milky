// Use the same embedding providers as geminiService (Nomic/OpenAI/Ollama) if available.
// For text query embedding in search we just need a helper that returns a vector.

const getQueryEmbedding = async (text) => {
  if (!text || !text.trim()) return null;

  // 1) Try Nomic
  if (process.env.NOMIC_API_KEY) {
    const model = process.env.NOMIC_EMBED_MODEL || "nomic-embed-text-v1.5";
    const nomicBodies = [
      { model, texts: [text] },      // preferred by current API
      { model, input: [text] },      // legacy fallback
      { model, text: [text] },
      { model, inputs: [text] },
    ];
    for (const body of nomicBodies) {
      try {
        const res = await fetch("https://api-atlas.nomic.ai/v1/embedding/text", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NOMIC_API_KEY}`,
          },
          body: JSON.stringify(body),
        });
        const raw = await res.text();
        let data = null;
        try {
          data = JSON.parse(raw);
        } catch {
          console.warn(
            `⚠️ Nomic response not JSON (status ${res.status}): ${raw.slice(0, 200)}`
          );
          continue;
        }
        const vec = data?.embeddings?.[0] || data?.data?.[0]?.embedding;
        if (Array.isArray(vec) && vec.length) {
          return vec;
        }
        console.warn("⚠️ Nomic query embedding empty or missing for payload keys:", Object.keys(body).join(","));
      } catch (err) {
        console.warn("⚠️ Nomic query embedding failed:", err.message);
      }
    }
  }

  // 2) Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
          input: text,
        }),
      });
      const data = await res.json();
      const vec = data?.data?.[0]?.embedding;
      if (Array.isArray(vec) && vec.length) {
        console.log(`🔎 OpenAI query embedding ok (dim=${vec.length})`);
        return vec;
      }
      console.warn("⚠️ OpenAI query embedding empty or missing");
    } catch (err) {
      console.warn("⚠️ OpenAI query embedding failed:", err.message);
    }
  }

  // 3) Try local/hosted Ollama endpoint
  if (process.env.EMBEDDING_HOST) {
    try {
      const res = await fetch(`${process.env.EMBEDDING_HOST}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.EMBEDDING_MODEL || "nomic-embed-text",
          prompt: text,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data?.embedding) && data.embedding.length) {
        console.log(`🔎 Local query embedding ok (dim=${data.embedding.length})`);
        return data.embedding;
      }
      console.warn("⚠️ Local query embedding empty or missing");
    } catch (err) {
      console.warn("⚠️ Local query embedding failed:", err.message);
    }
  }

  return null;
};

module.exports = {
  getQueryEmbedding,
};
