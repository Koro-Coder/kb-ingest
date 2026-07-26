// Builds a CSV of parse warnings for the content team to work through.
// Kept separate from the routes so the column set is defined in one place.

const COLUMNS = [
  'Book',
  'Subject',
  'File',
  'Question',
  'Rendered',
  'Command',
  'Issue',
  'Source snippet',
  'GitHub link'
];

// RFC 4180: wrap in quotes and double any embedded quote. Raw snippets contain
// newlines and commas, so quoting is not optional here.
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function githubLink(book, file) {
  const repo = book.repo || {};
  if (!repo.owner || !repo.name) {
    return '';
  }
  const path = repo.rootPath ? `${repo.rootPath}/${file.path}` : file.path;
  return `https://github.com/${repo.owner}/${repo.name}/blob/${repo.branch}/${path}`;
}

function warningRows(book) {
  const rows = [];
  for (const file of book.files || []) {
    for (const warning of file.warnings || []) {
      rows.push([
        book.label || book.bookId,
        book.subject,
        file.path,
        warning.questionId || '',
        warning.excluded ? 'NO — excluded' : 'yes',
        warning.command ? `\\${warning.command}` : '',
        warning.message,
        // Collapse newlines so each warning stays on one spreadsheet row.
        (warning.raw || '').replace(/\r?\n/g, ' ').trim(),
        githubLink(book, file)
      ]);
    }
  }
  return rows;
}

// Excluded questions first — those are the ones actually missing from the
// site — then by book/file/question so related fixes sit together.
function compareRows(a, b) {
  const aExcluded = a[4].startsWith('NO') ? 0 : 1;
  const bExcluded = b[4].startsWith('NO') ? 0 : 1;
  if (aExcluded !== bExcluded) return aExcluded - bExcluded;
  for (const idx of [0, 2, 3]) {
    const cmp = String(a[idx]).localeCompare(String(b[idx]), undefined, { numeric: true });
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function buildWarningsCsv(books) {
  const rows = books.flatMap(warningRows).sort(compareRows);
  const lines = [COLUMNS, ...rows].map((row) => row.map(csvCell).join(','));
  // Leading BOM so Excel detects UTF-8 and renders — ° Ω correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { buildWarningsCsv };
