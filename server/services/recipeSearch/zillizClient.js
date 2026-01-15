const { MilvusClient, DataType } = require("@zilliz/milvus2-sdk-node");

const ZILLIZ_ENDPOINT = process.env.ZILLIZ_ENDPOINT;
const ZILLIZ_TOKEN = process.env.ZILLIZ_TOKEN;
const ZILLIZ_COLLECTION = process.env.ZILLIZ_COLLECTION || "recipes";
const VECTOR_FIELD = process.env.ZILLIZ_VECTOR_FIELD || "embedding";
const VECTOR_DIM = Number(process.env.ZILLIZ_VECTOR_DIM || 768);

if (!ZILLIZ_ENDPOINT || !ZILLIZ_TOKEN) {
  throw new Error("Missing ZILLIZ_ENDPOINT or ZILLIZ_TOKEN in env");
}

const milvus = new MilvusClient({
  address: ZILLIZ_ENDPOINT,
  token: ZILLIZ_TOKEN,
  ssl: true,
});

module.exports = {
  milvus,
  VECTOR_FIELD,
  VECTOR_DIM,
  ZILLIZ_COLLECTION,
  DataType,
};
