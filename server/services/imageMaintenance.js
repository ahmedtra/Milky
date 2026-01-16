const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const fetch = global.fetch || require("node-fetch");
const { client: esClient, recipeIndex } = require("./recipeSearch/elasticsearchClient");

const IMAGE_DIR = path.resolve(__dirname, "../../public/meal-images");
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

async function fetchImageDocs() {
  const referenced = new Map(); // filename -> {remote,url}
  try {
    // Fetch docs that have imageUrl set; compute file name from ES _id
    let from = 0;
    const size = 500;
    while (true) {
      const res = await esClient.search({
        index: recipeIndex,
        from,
        size,
        query: { exists: { field: "imageUrl" } },
        _source: ["image", "imageUrl"],
      });
      const hits = res?.hits?.hits || [];
      hits.forEach((h) => {
        const remote = h._source?.image && h._source.image.startsWith("http") ? h._source.image : null;
        const r2 = h._source?.imageUrl && h._source.imageUrl.startsWith("http") ? h._source.imageUrl : null;
        const restoreFrom = r2 || remote;
        if (!restoreFrom) return;
        const esId = h._id;
        const file = `${String(esId).replace(/[^a-z0-9_-]+/gi, "_")}.png`;
        referenced.set(file, { remote: restoreFrom, esId });
      });
      if (hits.length < size) break;
      from += size;
    }
  } catch (err) {
    console.warn("⚠️ Image maintenance: failed to fetch ES docs", err.message);
  }
  return referenced;
}

async function ensureLocalFile(file, remoteUrl) {
  if (!remoteUrl) return;
  const target = path.join(IMAGE_DIR, file);
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`Download failed ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(target, buf);
    console.log("🔄 Restored missing image from remote", { file });
  } catch (err) {
    console.warn("⚠️ Failed to restore image", { file, err: err.message });
  }
}

async function runImageMaintenance() {
  try {
    if (!fs.existsSync(IMAGE_DIR)) return;
    const referenced = await fetchImageDocs();

    // Restore missing referenced files
    for (const [file, info] of referenced.entries()) {
      const target = path.join(IMAGE_DIR, file);
      if (!fs.existsSync(target) && info.remote) {
        await ensureLocalFile(file, info.remote);
      }
    }

    // Delete unreferenced files older than 2 days
    const files = fs.readdirSync(IMAGE_DIR);
    const now = Date.now();
    files.forEach((file) => {
      const full = path.join(IMAGE_DIR, file);
      const stat = fs.statSync(full);
      const isReferenced = referenced.has(file);
      if (!isReferenced && now - stat.mtimeMs > TWO_DAYS_MS) {
        fs.unlinkSync(full);
        console.log("🧹 Deleted stale image", { file });
      }
    });
  } catch (err) {
    console.warn("⚠️ Image maintenance error", err.message);
  }
}

function initializeImageMaintenance() {
  // Run daily at 04:00
  cron.schedule("0 4 * * *", () => runImageMaintenance());
  console.log("🗓️ Image maintenance scheduled (daily 04:00)");
}

module.exports = { initializeImageMaintenance, runImageMaintenance };
