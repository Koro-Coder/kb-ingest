// Refresh-token persistence for admin sessions. Same contract as kb-website's
// refresh store, plus revokeAllForUser — withdrawing someone's admin access
// has to end their sessions, not just stop new ones.
//
// A separate collection from the public site's: an admin session and a reader
// session are different things and must not be interchangeable.

const { collection, COLLECTIONS } = require('./mongo');

// expiresAt is stored as a Date so the TTL index can reap expired rows, but
// crosses the boundary as an ISO string to match the in-memory store.
function toRecord(doc) {
  if (!doc) {
    return null;
  }
  const { _id, expiresAt, ...rest } = doc;
  return {
    hash: _id,
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    ...rest
  };
}

async function create(record) {
  const sessions = await collection(COLLECTIONS.adminSessions);
  const { hash, expiresAt, ...rest } = record;
  await sessions.insertOne({ _id: hash, expiresAt: new Date(expiresAt), ...rest });
  return record;
}

async function findByHash(hash) {
  const sessions = await collection(COLLECTIONS.adminSessions);
  return toRecord(await sessions.findOne({ _id: hash }));
}

async function markReplaced(hash, replacedByHash, at) {
  const sessions = await collection(COLLECTIONS.adminSessions);
  await sessions.updateOne({ _id: hash }, { $set: { replacedByHash, usedAt: at } });
}

async function revoke(hash, at) {
  const sessions = await collection(COLLECTIONS.adminSessions);
  await sessions.updateOne({ _id: hash }, { $set: { revokedAt: at } });
}

async function revokeFamily(familyId, at) {
  const sessions = await collection(COLLECTIONS.adminSessions);
  const result = await sessions.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: at } });
  return result.modifiedCount;
}

async function revokeAllForUser(userId, at) {
  const sessions = await collection(COLLECTIONS.adminSessions);
  const result = await sessions.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } });
  return result.modifiedCount;
}

module.exports = { create, findByHash, markReplaced, revoke, revokeFamily, revokeAllForUser };
