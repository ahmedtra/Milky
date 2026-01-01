const { Client } = require('@elastic/elasticsearch');

const defaultNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const recipeIndex = process.env.ELASTICSEARCH_RECIPE_INDEX || 'recipes';
const rejectUnauthorized = process.env.ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED !== 'false';

const auth = process.env.ELASTICSEARCH_API_KEY
  ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
  : (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD)
    ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD }
    : undefined;

// Keep the client lean; most options come from env to keep this file portable.
const client = new Client({
  node: defaultNode,
  auth,
  sniffOnStart: false,
  sniffInterval: false,
  sniffOnConnectionFault: false,
  tls: { rejectUnauthorized }
});

const ensureConnection = async () => {
  try {
    const alive = await client.ping();
    if (alive) {
      console.log(`✅ Elasticsearch reachable at ${defaultNode}`);
    }
  } catch (error) {
    console.error('❌ Elasticsearch connection failed:', error.message);
    throw error;
  }
};

module.exports = {
  client,
  recipeIndex,
  ensureConnection
};
