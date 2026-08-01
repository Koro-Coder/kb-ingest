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
  users: 'users'
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
