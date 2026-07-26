// Filesystem-backed knowledge-base store. Every function here is the swap
// point for a future MongoDB migration — callers only ever go through
// readCatalog/writeCatalog/readBook/writeBook, never touch fs directly.

const fs = require('fs');
const path = require('path');

function dataDir() {
  return path.resolve(__dirname, '../../', process.env.KB_DATA_DIR || '../kb-data');
}

function catalogPath() {
  return path.join(dataDir(), 'catalog.json');
}

function booksDir() {
  return path.join(dataDir(), 'books');
}

function bookPath(bookId) {
  return path.join(booksDir(), `${bookId}.json`);
}

function readCatalog() {
  const raw = fs.readFileSync(catalogPath(), 'utf8');
  return JSON.parse(raw);
}

function writeCatalog(catalog) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(catalogPath(), JSON.stringify(catalog, null, 2), 'utf8');
}

function readBook(bookId) {
  const raw = fs.readFileSync(bookPath(bookId), 'utf8');
  return JSON.parse(raw);
}

function writeBook(bookId, book) {
  fs.mkdirSync(booksDir(), { recursive: true });
  fs.writeFileSync(bookPath(bookId), JSON.stringify(book, null, 2), 'utf8');
}

function bookExists(bookId) {
  return fs.existsSync(bookPath(bookId));
}

function upsertBookSummary(summary) {
  const catalog = readCatalog();
  const idx = catalog.books.findIndex((b) => b.bookId === summary.bookId);
  if (idx === -1) {
    catalog.books.push(summary);
  } else {
    catalog.books[idx] = summary;
  }
  writeCatalog(catalog);
  return catalog;
}

function deleteBook(bookId) {
  const catalog = readCatalog();
  catalog.books = catalog.books.filter((b) => b.bookId !== bookId);
  writeCatalog(catalog);
  const file = bookPath(bookId);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

module.exports = {
  dataDir,
  readCatalog,
  writeCatalog,
  readBook,
  writeBook,
  bookExists,
  upsertBookSummary,
  deleteBook
};
