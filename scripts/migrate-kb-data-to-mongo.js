// One-time import of the filesystem knowledge base (kb-data/) into MongoDB.
//
//   node --env-file=.env scripts/migrate-kb-data-to-mongo.js
//
// Idempotent: every write is an upsert keyed by bookId / subject key, so
// re-running it overwrites the same documents rather than duplicating them.
// Nothing under kb-data/ is modified or deleted — the JSON stays on disk as a
// fallback until you're satisfied with the migration.

const fs = require('fs');
const path = require('path');
const kbStore = require('../server/store/kbStore');
const videoStore = require('../server/store/videoStore');
const mongo = require('../server/store/mongo');

function dataDir() {
  return path.resolve(__dirname, '..', process.env.KB_DATA_DIR || '../kb-data');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listJson(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ id: name.replace(/\.json$/, ''), file: path.join(dir, name) }));
}

async function migrateSubjects(root) {
  const catalogFile = path.join(root, 'catalog.json');
  if (!fs.existsSync(catalogFile)) {
    console.log('  no catalog.json — skipping subjects');
    return 0;
  }
  const catalog = readJson(catalogFile);
  const subjects = catalog.subjects || [];
  if (!subjects.length) {
    console.log('  catalog.json has no subjects array — skipping');
    return 0;
  }
  await kbStore.writeSubjects(subjects);
  return subjects.length;
}

async function migrateBooks(root) {
  const books = listJson(path.join(root, 'books'));
  for (const { id, file } of books) {
    const book = readJson(file);
    // Trust the document's own bookId over the filename if they disagree.
    await kbStore.writeBook(book.bookId || id, book);
    console.log(`  book ${book.bookId || id} (${book.questionCount ?? '?'} questions)`);
  }
  return books.length;
}

async function migrateVideos(root) {
  const files = listJson(path.join(root, 'videos'));
  let overrides = 0;
  for (const { id, file } of files) {
    const videos = readJson(file);
    await videoStore.writeVideos(id, videos);
    overrides += Object.keys(videos).length;
    console.log(`  videos ${id} (${Object.keys(videos).length} overrides)`);
  }
  return overrides;
}

async function main() {
  const root = dataDir();
  if (!fs.existsSync(root)) {
    throw new Error(`KB_DATA_DIR does not exist: ${root}`);
  }
  console.log(`Migrating ${root} -> MongoDB database "${mongo.databaseName()}"\n`);

  await mongo.ensureIndexes();

  console.log('Subjects:');
  const subjects = await migrateSubjects(root);
  console.log('Books:');
  const books = await migrateBooks(root);
  console.log('Video overrides:');
  const overrides = await migrateVideos(root);

  console.log(
    `\nDone. ${subjects} subject(s), ${books} book(s), ${overrides} video override(s) written.`
  );
}

main()
  .catch((error) => {
    console.error('\nMigration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongo.close());
