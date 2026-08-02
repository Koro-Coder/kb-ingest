// Search / filter / sort for the admin report queue.
//
// Deliberately pure functions over plain arrays, with no database in sight:
// the interesting behaviour is that an admin can search by *domain* or *book
// label*, neither of which the report itself stores — those come from the
// catalog at read time. Doing the work here keeps it testable and keeps a
// re-synced book's current names showing rather than whatever was true when
// the report was filed.

const TYPE_LABELS = {
  question_issue: 'Question problem',
  solution_issue: 'Solution problem',
  video_request: 'Video request'
};

const STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];

// Fields the free-text box searches. Includes the enriched ones, which is the
// whole point — "Digital Electronics" appears on no raw report.
const SEARCH_FIELDS = [
  'bookLabel',
  'bookId',
  'repo',
  'subject',
  'domain',
  'branch',
  'chapterLabel',
  'fileId',
  'questionId',
  'label',
  'comment',
  'type',
  'typeLabel',
  'status'
];

const SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'type',
  'typeLabel',
  'status',
  'subject',
  'domain',
  'branch',
  'bookLabel',
  'chapterLabel',
  'year',
  'questionNum',
  'questionId'
]);

const DEFAULT_SORT = 'createdAt';

// bookSummary comes from the catalog; chapterLabel from the book document's
// files[]. Both are optional — a report about a book that has since been
// deleted must still be visible, not silently dropped.
// The GitHub repo a report ultimately points at, as owner/name — the thing an
// admin actually has to go and edit, e.g.
// prepfusiongatepyq/PrepFusion_Digital_Electronics_EC_V1.
function repoFullName(bookSummary) {
  const repo = bookSummary && bookSummary.repo;
  if (!repo || !repo.owner || !repo.name) {
    return null;
  }
  return `${repo.owner}/${repo.name}`;
}

function enrichReport(report, { bookSummary, chapterLabel } = {}) {
  return {
    ...report,
    subject: report.subject || (bookSummary ? bookSummary.subject : null) || null,
    domain: bookSummary ? bookSummary.domain : null,
    branch: bookSummary ? bookSummary.branch : null,
    repo: repoFullName(bookSummary),
    bookLabel: (bookSummary && bookSummary.label) || report.bookId,
    chapterLabel: chapterLabel || report.fileId,
    typeLabel: TYPE_LABELS[report.type] || report.type,
    // Flags a row whose book is gone, so the UI can say so rather than showing
    // a raw id with no explanation.
    orphaned: !bookSummary
  };
}

function matchesSearch(report, term) {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return SEARCH_FIELDS.some((field) => {
    const value = report[field];
    return value !== null && value !== undefined && String(value).toLowerCase().includes(needle);
  });
}

function filterReports(reports, filters = {}) {
  const { type, status, subject, domain, branch, bookId, search } = filters;
  return reports.filter((report) => {
    if (type && report.type !== type) return false;
    if (status && report.status !== status) return false;
    if (subject && report.subject !== subject) return false;
    if (domain && report.domain !== domain) return false;
    if (branch && report.branch !== branch) return false;
    if (bookId && report.bookId !== bookId) return false;
    return matchesSearch(report, search);
  });
}

function compareValues(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  // `numeric` so "Chapter 2" sorts before "Chapter 10", and so question ids
  // like 1.9.1 / 1.10.1 order the way a human expects.
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortReports(reports, sort, dir = 'desc') {
  const field = SORT_FIELDS.has(sort) ? sort : DEFAULT_SORT;
  const factor = dir === 'asc' ? 1 : -1;
  // Slice first: sorting the caller's array in place is a surprise.
  return reports.slice().sort((a, b) => {
    const primary = compareValues(a[field], b[field]);
    if (primary !== 0) {
      return primary * factor;
    }
    // Stable, meaningful tiebreak so equal keys don't shuffle between renders.
    return compareValues(a.id, b.id);
  });
}

// Every analytics table is per-question, not per-report: the actionable unit
// is "this question has a problem" / "this many people want a video for it",
// and the individual reports are what the detail view is for.
//
// Counted by distinct user — one person pressing a button twice is not demand.
function groupByQuestion(reports) {
  const groups = new Map();
  for (const report of reports) {
    const key = questionKey(report);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        type: report.type,
        bookId: report.bookId,
        fileId: report.fileId,
        year: report.year,
        questionNum: report.questionNum,
        questionId: report.questionId || null,
        label: report.label || null,
        subject: report.subject,
        repo: report.repo,
        bookLabel: report.bookLabel,
        chapterLabel: report.chapterLabel,
        ordinal: report.ordinal || null,
        orphaned: report.orphaned,
        users: new Set(),
        reportIds: [],
        comments: [],
        latestAt: report.createdAt,
        firstAt: report.createdAt
      });
    }
    const group = groups.get(key);
    group.users.add(report.userId);
    group.reportIds.push(report.id);
    if (report.comment) {
      group.comments.push(report.comment);
    }
    if (report.createdAt > group.latestAt) {
      group.latestAt = report.createdAt;
    }
    if (report.createdAt < group.firstAt) {
      group.firstAt = report.createdAt;
    }
  }

  return [...groups.values()].map(({ users, ...rest }) => ({ ...rest, requestCount: users.size }));
}

// The question triple plus its book — the same identity kb-website files
// reports against, and the same one videoStore keys overrides on.
function questionKey(report) {
  return `${report.bookId}::${report.fileId}|${report.year}|${report.questionNum}`;
}

// Collapses difficulty ratings per question into a distribution plus a single
// verdict. Counted by distinct user for the same reason the report groups are:
// one person changing their mind is not two opinions — and since a re-rating
// replaces the old row, each user appears at most once per question anyway.
function groupRatings(ratings) {
  const groups = new Map();

  for (const rating of ratings) {
    const key = questionKey(rating);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        bookId: rating.bookId,
        fileId: rating.fileId,
        year: rating.year,
        questionNum: rating.questionNum,
        questionId: rating.questionId || null,
        subject: rating.subject,
        repo: rating.repo,
        bookLabel: rating.bookLabel,
        chapterLabel: rating.chapterLabel,
        ordinal: rating.ordinal || null,
        orphaned: rating.orphaned,
        easy: 0,
        medium: 0,
        hard: 0,
        ratingCount: 0,
        latestAt: rating.updatedAt || rating.createdAt
      });
    }
    const group = groups.get(key);
    if (group[rating.rating] === undefined) {
      continue;
    }
    group[rating.rating] += 1;
    group.ratingCount += 1;
    const at = rating.updatedAt || rating.createdAt;
    if (at > group.latestAt) {
      group.latestAt = at;
    }
  }

  return [...groups.values()].map((group) => ({ ...group, ...verdictFor(group) }));
}

// A single number so the table can be sorted by "how hard": easy=1, hard=3.
// The consensus is simply the most-chosen level, with ties resolved towards
// the harder one — a question half the readers found hard is worth surfacing.
function verdictFor({ easy, medium, hard, ratingCount }) {
  if (!ratingCount) {
    return { consensus: null, difficultyScore: 0 };
  }
  const difficultyScore = Number(((easy * 1 + medium * 2 + hard * 3) / ratingCount).toFixed(2));
  const ordered = [
    ['hard', hard],
    ['medium', medium],
    ['easy', easy]
  ].sort((a, b) => b[1] - a[1]);
  return { consensus: ordered[0][0], difficultyScore };
}

const RATING_SORT_FIELDS = new Set([
  'ratingCount',
  'difficultyScore',
  'consensus',
  'subject',
  'repo',
  'bookLabel',
  'chapterLabel',
  'questionId',
  'questionNum',
  'year',
  'latestAt',
  'easy',
  'medium',
  'hard'
]);

function sortRatingGroups(groups, sort, dir = 'desc') {
  const field = RATING_SORT_FIELDS.has(sort) ? sort : 'ratingCount';
  const factor = dir === 'asc' ? 1 : -1;
  return groups.slice().sort((a, b) => {
    const primary = compareValues(a[field], b[field]);
    if (primary !== 0) {
      return primary * factor;
    }
    const recency = compareValues(a.latestAt, b.latestAt);
    if (recency !== 0) {
      return -recency;
    }
    return compareValues(a.key, b.key);
  });
}

const GROUP_SORT_FIELDS = new Set([
  'requestCount',
  'subject',
  'repo',
  'bookLabel',
  'chapterLabel',
  'questionId',
  'questionNum',
  'year',
  'latestAt',
  'firstAt'
]);

// Defaults to most-requested first: that is the whole reason these tables are
// grouped rather than listed.
function sortGroups(groups, sort, dir = 'desc') {
  const field = GROUP_SORT_FIELDS.has(sort) ? sort : 'requestCount';
  const factor = dir === 'asc' ? 1 : -1;
  return groups.slice().sort((a, b) => {
    const primary = compareValues(a[field], b[field]);
    if (primary !== 0) {
      return primary * factor;
    }
    // Equal counts: the busier-recently question is the more urgent one.
    const recency = compareValues(a.latestAt, b.latestAt);
    if (recency !== 0) {
      return -recency;
    }
    return compareValues(a.key, b.key);
  });
}

function summarise(reports) {
  const byType = {};
  for (const type of Object.keys(TYPE_LABELS)) {
    byType[type] = { label: TYPE_LABELS[type], total: 0, open: 0 };
  }
  for (const report of reports) {
    if (!byType[report.type]) {
      byType[report.type] = { label: report.type, total: 0, open: 0 };
    }
    byType[report.type].total += 1;
    if (report.status === 'open') {
      byType[report.type].open += 1;
    }
  }
  return byType;
}

// Distinct values actually present, so the filter dropdowns never offer a
// choice that returns nothing.
//
// Domain and branch are deliberately absent: only technical books carry them,
// so as table columns they are blank for maths and aptitude, and as filters
// they silently exclude every book that has none. The book label already
// carries the same information where it exists ("… Digital Electronics EC").
function facets(reports) {
  const pick = (field) =>
    [...new Set(reports.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== ''))].sort(
      (a, b) => compareValues(a, b)
    );
  return {
    subjects: pick('subject'),
    books: [...new Map(reports.map((r) => [r.bookId, r.bookLabel])).entries()]
      .map(([bookId, label]) => ({ bookId, label }))
      .sort((a, b) => compareValues(a.label, b.label)),
    types: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
  };
}

module.exports = {
  enrichReport,
  filterReports,
  sortReports,
  groupByQuestion,
  sortGroups,
  groupRatings,
  sortRatingGroups,
  questionKey,
  summarise,
  facets,
  matchesSearch,
  TYPE_LABELS,
  STATUSES,
  SORT_FIELDS,
  GROUP_SORT_FIELDS,
  DEFAULT_SORT
};
