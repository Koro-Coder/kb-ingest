// Read-only view of the users kb-website signs in, used solely to show an
// admin who filed a report. This project never creates or modifies a user.

const { collection, COLLECTIONS } = require('./mongo');

// Only what a reviewer needs to recognise and, if necessary, reply to the
// person — never the provider id or any token state.
function toProfile(doc) {
  if (!doc) {
    return null;
  }
  return {
    id: doc._id,
    name: doc.name || null,
    email: doc.email || null,
    avatarUrl: doc.avatarUrl || null,
    createdAt: doc.createdAt || null
  };
}

async function findManyByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) {
    return new Map();
  }
  const users = await collection(COLLECTIONS.users);
  const rows = await users.find({ _id: { $in: unique } }).toArray();
  return new Map(rows.map((doc) => [doc._id, toProfile(doc)]));
}

module.exports = { findManyByIds };
