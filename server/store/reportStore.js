// Read access to the report queue kb-website writes, plus the deletes this
// project performs once the underlying problem is fixed.
//
// Reports are never *created* here — that belongs to the user who filed one.

const { collection, COLLECTIONS } = require('./mongo');

// Enrichment and free-text search span fields the reports do not store (book
// label, chapter label), so the working set is pulled and processed in memory.
// That is fine at queue scale; this cap is the guard against it silently
// becoming not fine.
const MAX_ROWS = 5000;

function toReport(doc) {
  if (!doc) {
    return null;
  }
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

async function listAll() {
  const reports = await collection(COLLECTIONS.reports);
  const rows = await reports.find({}).sort({ createdAt: -1 }).limit(MAX_ROWS).toArray();
  return rows.map(toReport);
}

async function listByType(type) {
  const reports = await collection(COLLECTIONS.reports);
  const rows = await reports.find({ type }).sort({ createdAt: -1 }).limit(MAX_ROWS).toArray();
  return rows.map(toReport);
}

// Everyone who filed this kind of report about this exact question.
function questionFilter(type, ref) {
  return {
    type,
    bookId: ref.bookId,
    fileId: ref.fileId,
    year: Number(ref.year),
    questionNum: Number(ref.questionNum)
  };
}

async function listForQuestion(type, ref) {
  const reports = await collection(COLLECTIONS.reports);
  const rows = await reports.find(questionFilter(type, ref)).sort({ createdAt: 1 }).toArray();
  return rows.map(toReport);
}

// Resolving is a delete, not a status change: once the question or its
// solution is fixed, every report about it is answered at once, and a queue
// that keeps resolved rows around stops being a to-do list. Irreversible.
//
// Returns the rows it removed, because the people who filed them have to be
// told — which means reading them before they are gone.
async function deleteForQuestion(type, ref) {
  const reports = await collection(COLLECTIONS.reports);
  const filter = questionFilter(type, ref);
  const removed = (await reports.find(filter).toArray()).map(toReport);
  await reports.deleteMany(filter);
  return removed;
}

// Called when a video link appears for a question: the requests have been
// answered, so they stop being outstanding demand.
// Also returns what it removed, so the people who asked for those videos can
// be told one is now available.
async function deleteVideoRequestsFor(bookId, refs) {
  if (!refs.length) {
    return [];
  }
  const reports = await collection(COLLECTIONS.reports);
  const filter = {
    type: 'video_request',
    bookId,
    $or: refs.map((r) => ({
      fileId: r.fileId,
      year: Number(r.year),
      questionNum: Number(r.questionNum)
    }))
  };
  const removed = (await reports.find(filter).toArray()).map(toReport);
  await reports.deleteMany(filter);
  return removed;
}

module.exports = {
  listAll,
  listByType,
  listForQuestion,
  deleteForQuestion,
  deleteVideoRequestsFor,
  MAX_ROWS
};
