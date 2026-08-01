const express = require('express');
const kbStore = require('../store/kbStore');
const reportStore = require('../store/reportStore');
const userStore = require('../store/userStore');
const videoStore = require('../store/videoStore');
const {
  enrichReport,
  filterReports,
  groupByQuestion,
  sortGroups,
  facets,
  summarise,
  TYPE_LABELS
} = require('../reportQuery');

const router = express.Router();

function validType(type) {
  return Object.prototype.hasOwnProperty.call(TYPE_LABELS, type);
}

// Builds the bookId -> {summary, chapter labels} lookup used to enrich every
// report. Each book document is read once per request rather than once per
// report, which matters when a hundred reports share three books.
async function buildLookup(reports) {
  const catalog = await kbStore.readCatalog();
  const summaries = new Map(catalog.books.map((b) => [b.bookId, b]));

  const neededBooks = [...new Set(reports.map((r) => r.bookId))].filter((id) => summaries.has(id));
  const chapterLabels = new Map();

  await Promise.all(
    neededBooks.map(async (bookId) => {
      try {
        const book = await kbStore.readBook(bookId);
        for (const file of book.files || []) {
          chapterLabels.set(`${bookId}::${file.fileId}`, file.label);
        }
      } catch (error) {
        // A summary without a readable document still yields a usable row.
      }
    })
  );

  return { summaries, chapterLabels };
}

async function enrichAll(reports) {
  const { summaries, chapterLabels } = await buildLookup(reports);
  return reports.map((report) =>
    enrichReport(report, {
      bookSummary: summaries.get(report.bookId),
      chapterLabel: chapterLabels.get(`${report.bookId}::${report.fileId}`)
    })
  );
}

// A video request is outstanding demand only until the video exists. Rather
// than relying on someone remembering to clear them, requests whose question
// now has a link are dropped from the queue on read — and deleted, so the
// cleanup is permanent.
async function dropAnsweredVideoRequests(reports) {
  const byBook = new Map();
  for (const report of reports) {
    if (!byBook.has(report.bookId)) {
      byBook.set(report.bookId, []);
    }
    byBook.get(report.bookId).push(report);
  }

  const answered = [];
  await Promise.all(
    [...byBook.entries()].map(async ([bookId, group]) => {
      const videos = await videoStore.readVideos(bookId);
      for (const report of group) {
        if (videos[videoStore.videoKey(report.fileId, report.year, report.questionNum)]) {
          answered.push(report);
        }
      }
    })
  );

  if (answered.length) {
    const byBookId = new Map();
    for (const report of answered) {
      if (!byBookId.has(report.bookId)) {
        byBookId.set(report.bookId, []);
      }
      byBookId.get(report.bookId).push(report);
    }
    await Promise.all(
      [...byBookId.entries()].map(([bookId, group]) => reportStore.deleteVideoRequestsFor(bookId, group))
    );
  }

  const answeredIds = new Set(answered.map((r) => r.id));
  return reports.filter((r) => !answeredIds.has(r.id));
}

// GET /api/reports/questions?type=&search=&subject=&bookId=&sort=&dir=
// One row per question, counted by distinct user — the shape all three
// analytics tables share.
router.get('/questions', async (req, res, next) => {
  const type = req.query.type;
  if (!validType(type)) {
    res.status(400).json({ error: `type must be one of: ${Object.keys(TYPE_LABELS).join(', ')}` });
    return;
  }
  try {
    let reports = await reportStore.listByType(type);
    if (type === 'video_request') {
      reports = await dropAnsweredVideoRequests(reports);
    }

    const enriched = await enrichAll(reports);
    const matched = filterReports(enriched, {
      subject: req.query.subject,
      bookId: req.query.bookId,
      search: req.query.search
    });

    const groups = groupByQuestion(matched);
    res.json({
      type,
      typeLabel: TYPE_LABELS[type],
      totalReports: enriched.length,
      totalQuestions: groupByQuestion(enriched).length,
      matchedQuestions: groups.length,
      // Facets come from the unfiltered set so the dropdowns don't collapse to
      // a single option the moment you pick something.
      facets: facets(enriched),
      questions: sortGroups(groups, req.query.sort, req.query.dir === 'asc' ? 'asc' : 'desc')
    });
  } catch (error) {
    next(error);
  }
});

// Counts for the three tab headings, in one call.
router.get('/summary', async (req, res, next) => {
  try {
    let reports = await reportStore.listAll();
    const videoRequests = reports.filter((r) => r.type === 'video_request');
    if (videoRequests.length) {
      const kept = await dropAnsweredVideoRequests(videoRequests);
      const keptIds = new Set(kept.map((r) => r.id));
      reports = reports.filter((r) => r.type !== 'video_request' || keptIds.has(r.id));
    }

    const byType = summarise(reports);
    for (const type of Object.keys(byType)) {
      byType[type].questions = groupByQuestion(reports.filter((r) => r.type === type)).length;
    }
    res.json(byType);
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/question?type=&bookId=&fileId=&year=&questionNum=
// Everything behind one row: who filed it, when, and what they wrote.
router.get('/question', async (req, res, next) => {
  const { type, bookId, fileId, year, questionNum } = req.query;
  if (!validType(type)) {
    res.status(400).json({ error: `type must be one of: ${Object.keys(TYPE_LABELS).join(', ')}` });
    return;
  }
  if (!bookId || !fileId || year === undefined || questionNum === undefined) {
    res.status(400).json({ error: 'bookId, fileId, year and questionNum are required' });
    return;
  }

  try {
    const raw = await reportStore.listForQuestion(type, { bookId, fileId, year, questionNum });
    if (!raw.length) {
      res.status(404).json({ error: 'No reports for that question' });
      return;
    }

    const enriched = await enrichAll(raw);
    const users = await userStore.findManyByIds(raw.map((r) => r.userId));
    const [group] = groupByQuestion(enriched);
    const video = await videoStore.getVideo(bookId, fileId, Number(year), Number(questionNum));

    res.json({
      question: { ...group, video },
      reports: enriched.map((report) => ({
        ...report,
        // A reviewer needs to know who raised it; an unknown id means the
        // account was removed, which is worth showing rather than hiding.
        user: users.get(report.userId) || { id: report.userId, name: null, email: null }
      }))
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/reports/question?type=&bookId=&fileId=&year=&questionNum=
// "Resolved" — the question or its solution has been fixed, so every report
// about it is answered. Irreversible by design: the queue is a to-do list.
router.delete('/question', async (req, res, next) => {
  const { type, bookId, fileId, year, questionNum } = req.query;
  if (!validType(type)) {
    res.status(400).json({ error: `type must be one of: ${Object.keys(TYPE_LABELS).join(', ')}` });
    return;
  }
  if (!bookId || !fileId || year === undefined || questionNum === undefined) {
    res.status(400).json({ error: 'bookId, fileId, year and questionNum are required' });
    return;
  }
  try {
    const deleted = await reportStore.deleteForQuestion(type, { bookId, fileId, year, questionNum });
    if (!deleted) {
      res.status(404).json({ error: 'No reports for that question' });
      return;
    }
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
