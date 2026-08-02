// Read-only access to the difficulty ratings kb-website collects. This project
// never writes them — a rating belongs to the reader who gave it.

const { collection, COLLECTIONS } = require('./mongo');

// Same reasoning as the report queue: enrichment and free-text search span
// fields the rating does not store, so the working set is processed in memory.
const MAX_ROWS = 20000;

function toRating(doc) {
  if (!doc) {
    return null;
  }
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

async function listAll() {
  const ratings = await collection(COLLECTIONS.ratings);
  const rows = await ratings.find({}).sort({ updatedAt: -1 }).limit(MAX_ROWS).toArray();
  return rows.map(toRating);
}

module.exports = { listAll, MAX_ROWS };
