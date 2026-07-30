// CSV round-trip for solution video links: export one row per solved
// question, let someone fill in the "Video URL" column in Excel/Sheets, then
// re-upload. Only that one column is read back — everything else is context
// for the human, and the identity columns are what the upload matches on.

const { videoKey } = require('./store/videoStore');

const COLUMNS = ['Book', 'File', 'Question', 'Year', 'Question No', 'Type', 'Video URL'];

// Index of the columns the upload actually depends on.
const COL = { FILE: 1, QUESTION: 2, YEAR: 3, QNO: 4, VIDEO: 6 };

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

// Books synced before questionNum was stored on the stub don't carry it, and
// an export with a blank identity column can never be uploaded back. The
// printed id always ends in the question number ("1.10.4" -> 4), so derive it
// rather than emitting an unusable row.
function questionNumberOf(question) {
  if (Number.isFinite(question.questionNum)) {
    return question.questionNum;
  }
  const tail = String(question.questionId || '').split('.').pop();
  const parsed = Number(tail);
  return Number.isFinite(parsed) ? parsed : null;
}

// One row per question that HAS a solution — a video only ever accompanies a
// solution, so listing unsolved questions would just be noise to scroll past.
function buildVideosCsv(book, videos) {
  const rows = [];
  for (const file of book.files || []) {
    for (const question of file.questions || []) {
      if (!question.hasSolution) {
        continue;
      }
      const questionNum = questionNumberOf(question);
      const key = videoKey(file.fileId, question.year, questionNum);
      rows.push([
        book.label || book.bookId,
        file.fileId,
        question.questionId,
        question.year,
        questionNum,
        question.questionType,
        videos[key] || question.video || ''
      ]);
    }
  }

  const lines = [COLUMNS, ...rows].map((row) => row.map(csvCell).join(','));
  // Leading BOM so Excel opens it as UTF-8.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// RFC 4180 reader: handles quoted fields containing commas, newlines and
// doubled quotes, which the exported snippets and titles can all contain.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const input = text.replace(/^﻿/, '');

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'youtube-nocookie.com'];

function isAcceptableVideoUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    return YOUTUBE_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
}

// Applies an uploaded CSV onto the existing overrides. Rows are matched on
// (file, year, question number); a row naming a question that isn't in the
// book is reported rather than silently ignored, since that usually means the
// wrong book's CSV was uploaded.
function applyVideosCsv(book, existingVideos, csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { videos: existingVideos, applied: 0, cleared: 0, skipped: 0, errors: ['The file is empty.'] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (header[COL.VIDEO] !== 'video url' || header[COL.FILE] !== 'file') {
    return {
      videos: existingVideos,
      applied: 0,
      cleared: 0,
      skipped: 0,
      errors: [`Unexpected columns. Expected the exported header: ${COLUMNS.join(', ')}`]
    };
  }

  const known = new Set();
  // Secondary index so a CSV whose "Question No" column is blank (exported
  // before questionNum was stored) can still be matched on its printed id.
  const byQuestionId = new Map();
  for (const file of book.files || []) {
    for (const question of file.questions || []) {
      const questionNum = questionNumberOf(question);
      const key = videoKey(file.fileId, question.year, questionNum);
      known.add(key);
      byQuestionId.set(`${file.fileId}|${question.questionId}`, key);
    }
  }

  const videos = { ...existingVideos };
  const errors = [];
  let applied = 0;
  let cleared = 0;
  let skipped = 0;

  rows.slice(1).forEach((row, idx) => {
    const lineNo = idx + 2;
    if (row.every((c) => !c || !c.trim())) {
      return;
    }
    const fileId = (row[COL.FILE] || '').trim();
    const questionId = (row[COL.QUESTION] || '').trim();
    const rawYear = (row[COL.YEAR] || '').trim();
    const rawQno = (row[COL.QNO] || '').trim();
    const year = Number(rawYear);
    const url = (row[COL.VIDEO] || '').trim();

    if (!fileId || !Number.isFinite(year) || !rawYear) {
      errors.push(`Line ${lineNo}: missing File or Year.`);
      skipped += 1;
      return;
    }

    // Prefer the explicit number; fall back to the printed id when the column
    // is blank, so a CSV downloaded before this column was populated still
    // uploads cleanly.
    let key = null;
    if (rawQno && Number.isFinite(Number(rawQno))) {
      key = videoKey(fileId, year, Number(rawQno));
    } else if (questionId) {
      key = byQuestionId.get(`${fileId}|${questionId}`) || null;
    }

    if (!key) {
      errors.push(`Line ${lineNo}: could not identify the question — fill in "Question No" or re-download the CSV.`);
      skipped += 1;
      return;
    }

    if (!known.has(key)) {
      errors.push(
        `Line ${lineNo}: no question ${rawQno || questionId} (${year}) in ${fileId} — is this the right book's CSV?`
      );
      skipped += 1;
      return;
    }

    if (!url) {
      // A blank cell clears a previously-set link rather than being ignored,
      // so a wrong link can be removed the same way it was added.
      if (videos[key]) {
        delete videos[key];
        cleared += 1;
      }
      return;
    }

    if (!isAcceptableVideoUrl(url)) {
      errors.push(`Line ${lineNo}: "${url.slice(0, 60)}" is not a YouTube URL.`);
      skipped += 1;
      return;
    }

    if (videos[key] !== url) {
      videos[key] = url;
      applied += 1;
    }
  });

  return { videos, applied, cleared, skipped, errors };
}

module.exports = { buildVideosCsv, applyVideosCsv, parseCsv, isAcceptableVideoUrl, COLUMNS };
