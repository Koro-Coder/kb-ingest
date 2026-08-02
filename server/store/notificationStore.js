// Write-only from this project: kb-ingest creates notifications when a report
// is resolved; kb-website is what shows them and marks them read.

const { collection, COLLECTIONS } = require('./mongo');

async function createMany(notifications) {
  if (!notifications.length) {
    return 0;
  }
  const store = await collection(COLLECTIONS.notifications);
  // Upsert rather than insert: a resolve retried after a partial failure must
  // not double-notify, and the id already encodes user + outcome + question +
  // timestamp.
  await store.bulkWrite(
    notifications.map(({ id, ...fields }) => ({
      replaceOne: { filter: { _id: id }, replacement: fields, upsert: true }
    }))
  );
  return notifications.length;
}

module.exports = { createMany };
