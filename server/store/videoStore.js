// Per-book video-link overrides, stored SEPARATELY from books/{bookId}.json.
// That separation is the whole point: the book document is regenerated from
// scratch on every sync, so anything written there would be wiped. These
// overrides are curated by hand (via the CSV round-trip) and must outlive
// re-syncs.
//
// A link supplied here wins over the \MCQSol{...}{video}{...} argument in the
// LaTeX source, so a video can be added without touching the solution repo.

const fs = require('fs');
const path = require('path');

function dataDir() {
  return path.resolve(__dirname, '../../', process.env.KB_DATA_DIR || '../kb-data');
}

function videosDir() {
  return path.join(dataDir(), 'videos');
}

function videosPath(bookId) {
  return path.join(videosDir(), `${bookId}.json`);
}

// Identity is (file, year, question number) — the same triple the solution
// join uses. The printed question id is NOT safe here: aptitude ids omit the
// session, so they repeat across files within a book.
function videoKey(fileId, year, questionNum) {
  return `${fileId}|${year}|${questionNum}`;
}

function readVideos(bookId) {
  try {
    return JSON.parse(fs.readFileSync(videosPath(bookId), 'utf8'));
  } catch (error) {
    return {};
  }
}

function writeVideos(bookId, videos) {
  fs.mkdirSync(videosDir(), { recursive: true });
  fs.writeFileSync(videosPath(bookId), JSON.stringify(videos, null, 2), 'utf8');
}

function getVideo(bookId, fileId, year, questionNum) {
  const videos = readVideos(bookId);
  return videos[videoKey(fileId, year, questionNum)] || null;
}

module.exports = { readVideos, writeVideos, getVideo, videoKey, videosPath };
