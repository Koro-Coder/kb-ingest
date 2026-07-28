const express = require('express');
const github = require('../github/client');
const kbStore = require('../store/kbStore');
const { syncBook, slugifyBookId, bookToSummary } = require('../parsing/ingest');
const { profileForSubject } = require('../parsing/adapters');
const { buildWarningsCsv } = require('../warningsCsv');

const router = express.Router();

function getToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set in the environment');
  }
  return token;
}

router.get('/', (req, res) => {
  const catalog = kbStore.readCatalog();
  res.json(catalog.books);
});

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

// Declared before '/:bookId' so the literal path isn't swallowed by the
// parameterised route.
router.get('/warnings.csv', (req, res) => {
  try {
    const catalog = kbStore.readCatalog();
    const books = catalog.books.map((summary) => kbStore.readBook(summary.bookId));
    sendCsv(res, `prepfusion-warnings-${todayStamp()}.csv`, buildWarningsCsv(books));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:bookId/warnings.csv', (req, res) => {
  try {
    const book = kbStore.readBook(req.params.bookId);
    sendCsv(res, `${req.params.bookId}-warnings-${todayStamp()}.csv`, buildWarningsCsv([book]));
  } catch (error) {
    res.status(404).json({ error: `Book not found: ${req.params.bookId}` });
  }
});

router.get('/:bookId', (req, res) => {
  try {
    const book = kbStore.readBook(req.params.bookId);
    res.json(book);
  } catch (error) {
    res.status(404).json({ error: `Book not found: ${req.params.bookId}` });
  }
});

// The org's solution-repo names don't follow one derivable rule
// (Digital_Electronics_EC_V1 -> Digital_EC_Solutions_V1, but
// Network_Theory_IN_V1 -> Network_Theory_IN_Solutions), so the admin supplies
// it explicitly rather than us guessing.
function parseSolutionRepo(url, solutionRootPath) {
  if (!url || !String(url).trim()) {
    return null;
  }
  const { owner, repo, branch } = github.parseRepoUrl(url);
  return { owner, name: repo, branch: branch || null, rootPath: solutionRootPath || '' };
}

// Register (or re-register) a repo and run a full sync immediately.
router.post('/', async (req, res) => {
  const {
    repoUrl,
    subject,
    domain,
    branch,
    label,
    rootPath,
    branchName,
    bookId: requestedId,
    solutionRepoUrl,
    solutionRootPath
  } = req.body || {};

  if (!repoUrl || !subject) {
    res.status(400).json({ error: 'repoUrl and subject are required' });
    return;
  }
  if (subject === 'technical' && (!domain || !branch)) {
    res.status(400).json({ error: 'domain and branch are required for technical books' });
    return;
  }

  try {
    const { owner, repo, branch: branchFromUrl } = github.parseRepoUrl(repoUrl);
    const parserProfile = profileForSubject(subject);
    const bookId = slugifyBookId(requestedId || repo);
    const bookLabel = label || repo.replace(/[_-]+/g, ' ').replace(/\bV\d+\b/i, '').trim();

    const book = await syncBook({
      bookId,
      subject,
      parserProfile,
      domain,
      branch,
      label: bookLabel,
      repo: { owner, name: repo, branch: branchName || branchFromUrl || null, rootPath: rootPath || '' },
      solutionRepo: parseSolutionRepo(solutionRepoUrl, solutionRootPath),
      token: getToken()
    });

    kbStore.writeBook(bookId, book);
    kbStore.upsertBookSummary(bookToSummary(book));

    res.status(201).json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Re-sync an already-registered book using its stored repo/subject config.
router.post('/:bookId/sync', async (req, res) => {
  const { bookId } = req.params;
  try {
    const catalog = kbStore.readCatalog();
    const existing = catalog.books.find((b) => b.bookId === bookId);
    if (!existing) {
      res.status(404).json({ error: `Book not found: ${bookId}` });
      return;
    }

    const book = await syncBook({
      bookId,
      subject: existing.subject,
      parserProfile: existing.parserProfile,
      domain: existing.domain,
      branch: existing.branch,
      label: existing.label,
      repo: existing.repo,
      // Re-sync keeps the stored solution repo, but also lets one be attached
      // (or replaced) without re-registering the whole book.
      solutionRepo: req.body && req.body.solutionRepoUrl
        ? parseSolutionRepo(req.body.solutionRepoUrl, req.body.solutionRootPath)
        : existing.solutionRepo || null,
      token: getToken()
    });

    kbStore.writeBook(bookId, book);
    kbStore.upsertBookSummary(bookToSummary(book));

    res.json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:bookId', (req, res) => {
  kbStore.deleteBook(req.params.bookId);
  res.status(204).end();
});

module.exports = router;
