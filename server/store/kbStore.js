// MongoDB-backed knowledge-base store. Every function here is the only place
// that touches the driver — callers still go through
// readCatalog/readBook/writeBook and never see a collection.
//
// The catalog is no longer a stored document. `books` holds one full book per
// registered repo, and the catalog's summary list is projected out of it, so a
// summary can no longer drift from the book it describes (under the old
// filesystem layout catalog.json and books/<id>.json were written separately
// and could disagree).
//
// Every function is async now; the filesystem versions were synchronous.

const { collection, COLLECTIONS } = require('./mongo');

// Mirrors parsing/ingest.js#bookToSummary — the fields a catalog row carries.
const SUMMARY_PROJECTION = {
  _id: 0,
  bookId: 1,
  subject: 1,
  domain: 1,
  branch: 1,
  label: 1,
  repo: 1,
  solutionRepo: 1,
  parserProfile: 1,
  lastSyncedAt: 1,
  questionCount: 1,
  solutionCount: 1,
  warningCount: 1
};

function notFound(bookId) {
  // Callers translate a throw into a 404; returning null would surface as a
  // 500 instead, so missing books must throw.
  return new Error(`Book not found: ${bookId}`);
}

async function readSubjects() {
  const subjects = await collection(COLLECTIONS.subjects);
  return subjects
    .find({}, { projection: { _id: 0, key: 1, label: 1 } })
    .sort({ order: 1, key: 1 })
    .toArray();
}

async function writeSubjects(list) {
  const subjects = await collection(COLLECTIONS.subjects);
  // Display order is the caller's array order, kept as a field because
  // MongoDB has no inherent document ordering.
  await Promise.all(
    list.map((subject, order) =>
      subjects.replaceOne(
        { _id: subject.key },
        { key: subject.key, label: subject.label, order },
        { upsert: true }
      )
    )
  );
}

async function readCatalog() {
  const books = await collection(COLLECTIONS.books);
  const [subjects, summaries] = await Promise.all([
    readSubjects(),
    books.find({}, { projection: SUMMARY_PROJECTION }).sort({ bookId: 1 }).toArray()
  ]);
  return { subjects, books: summaries };
}

async function readBook(bookId) {
  const books = await collection(COLLECTIONS.books);
  const book = await books.findOne({ _id: bookId }, { projection: { _id: 0 } });
  if (!book) {
    throw notFound(bookId);
  }
  return book;
}

async function writeBook(bookId, book) {
  const books = await collection(COLLECTIONS.books);
  // A sync regenerates the whole document, so replace rather than merge —
  // questions dropped from the source must disappear here too.
  await books.replaceOne({ _id: bookId }, { ...book, bookId }, { upsert: true });
}

async function bookExists(bookId) {
  const books = await collection(COLLECTIONS.books);
  return (await books.countDocuments({ _id: bookId }, { limit: 1 })) > 0;
}

async function deleteBook(bookId) {
  const books = await collection(COLLECTIONS.books);
  await books.deleteOne({ _id: bookId });
  // Video overrides are deliberately left behind, matching the old behaviour:
  // they are curated by hand and outlive the book document.
}

module.exports = {
  readCatalog,
  readSubjects,
  writeSubjects,
  readBook,
  writeBook,
  bookExists,
  deleteBook
};
