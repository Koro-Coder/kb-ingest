// MongoDB connection shared by every store module. One client per process,
// created lazily and reused: the driver pools connections internally, so
// opening a client per request is how you exhaust an Atlas connection limit.

const { MongoClient } = require('mongodb');

const DEFAULT_DB = 'prepfusion_kb';

const COLLECTIONS = {
  subjects: 'subjects',
  books: 'books',
  videos: 'videos',
  // Written by kb-website when a user reports a problem or asks for a video.
  // This project reads them, and deletes them once the underlying problem is
  // fixed — it is the admin side of that queue.
  reports: 'reports',
  // Read-only here: kb-website owns sign-in. Used only to show an admin who
  // filed a report.
  users: 'users',
  // Who may sign in to THIS portal, keyed by email. Deliberately separate from
  // `users`: that collection is everyone who ever signed in to the public
  // site, and admin access must never be a side effect of that.
  admins: 'admins',
  adminSessions: 'adminSessions',
  // Written by kb-website when a reader rates a question's difficulty. Read
  // only here, for the analytics.
  ratings: 'ratings',
  // Written HERE when a report is resolved, read by kb-website's bell menu.
  // Resolving is the only thing that tells a reader their report was acted on,
  // so it is also the only thing that creates one.
  notifications: 'notifications'
};

let clientPromise = null;

function connectionUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Note that the Atlas service-account variables ' +
        '(MONGODB_CLIENT_ID / MONGODB_CLIENT_SECRET) authenticate only to the ' +
        'Atlas Admin API — the driver needs a database connection string.'
    );
  }
  return uri;
}

function databaseName() {
  return process.env.MONGODB_DB || DEFAULT_DB;
}

function connect() {
  if (!clientPromise) {
    clientPromise = MongoClient.connect(connectionUri(), {
      serverSelectionTimeoutMS: 10000
    }).catch((error) => {
      // Never cache a rejected connection, or every later call keeps replaying
      // the first failure instead of retrying.
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

async function getDb() {
  const client = await connect();
  return client.db(databaseName());
}

async function collection(name) {
  const db = await getDb();
  return db.collection(name);
}

// _id carries the natural key for every collection (bookId, subject key,
// bookId::videoKey), so these only cover the list/filter queries.
async function ensureIndexes() {
  const db = await getDb();
  await db.collection(COLLECTIONS.books).createIndex({ subject: 1 });
  await db.collection(COLLECTIONS.videos).createIndex({ bookId: 1 });
  // How the admin queue reads them: newest first within a type/status, and
  // everything filed against one question.
  await db.collection(COLLECTIONS.reports).createIndex({ status: 1, type: 1, createdAt: -1 });
  await db.collection(COLLECTIONS.reports).createIndex({ bookId: 1, fileId: 1, year: 1, questionNum: 1 });
  // _id is the lowercased email, so uniqueness is free; this index backs the
  // "is there still an owner?" check that guards against locking everyone out.
  await db.collection(COLLECTIONS.admins).createIndex({ role: 1 });
  // How the bell menu reads them: this user's newest first, unread first.
  await db.collection(COLLECTIONS.notifications).createIndex({ userId: 1, createdAt: -1 });
  await db.collection(COLLECTIONS.notifications).createIndex({ userId: 1, readAt: 1 });
  await db.collection(COLLECTIONS.adminSessions).createIndex({ familyId: 1 });
  await db.collection(COLLECTIONS.adminSessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

async function ping() {
  const db = await getDb();
  await db.command({ ping: 1 });
  return true;
}

async function close() {
  if (!clientPromise) {
    return;
  }
  const client = await clientPromise;
  clientPromise = null;
  await client.close();
}

module.exports = { getDb, collection, ensureIndexes, ping, close, databaseName, COLLECTIONS };
