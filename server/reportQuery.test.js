const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enrichReport,
  filterReports,
  sortReports,
  groupByQuestion,
  sortGroups,
  groupRatings,
  sortRatingGroups,
  summarise,
  facets
} = require('./reportQuery');

const DE_BOOK = {
  bookId: 'de_ec',
  subject: 'technical',
  domain: 'Digital Electronics',
  branch: 'EC',
  label: 'PrepFusion Digital Electronics EC',
  repo: { owner: 'prepfusiongatepyq', name: 'PrepFusion_Digital_Electronics_EC_V1' }
};

const NT_BOOK = {
  bookId: 'nt_ee',
  subject: 'technical',
  domain: 'Network Theory',
  branch: 'EE',
  label: 'PrepFusion Network Theory EE',
  repo: { owner: 'prepfusiongatepyq', name: 'PrepFusion_Network_Theory_EE_V1' }
};

function raw(overrides = {}) {
  return {
    id: overrides.id || 'r1',
    userId: overrides.userId || 'u1',
    type: 'question_issue',
    status: 'open',
    bookId: 'de_ec',
    fileId: 'ch1_logic_gates',
    year: 2022,
    questionNum: 1,
    questionId: '1.22.1',
    comment: 'Option (C) is misprinted.',
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides
  };
}

function enriched(overrides = {}, book = DE_BOOK, chapterLabel = 'Logic Gates and Boolean Algebra') {
  return enrichReport(raw(overrides), { bookSummary: book, chapterLabel });
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

test('a report gains the domain, branch and labels it never stored itself', () => {
  const report = enriched();
  assert.equal(report.domain, 'Digital Electronics');
  assert.equal(report.branch, 'EC');
  assert.equal(report.bookLabel, 'PrepFusion Digital Electronics EC');
  assert.equal(report.chapterLabel, 'Logic Gates and Boolean Algebra');
  assert.equal(report.typeLabel, 'Question problem');
});

// The repo is what an admin has to go and edit, so it belongs on the report
// even though the report itself only ever stored a bookId.
test('a report gains the owner/name of the repo it points at', () => {
  assert.equal(enriched().repo, 'prepfusiongatepyq/PrepFusion_Digital_Electronics_EC_V1');
  assert.equal(
    enriched({ id: 'b', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts').repo,
    'prepfusiongatepyq/PrepFusion_Network_Theory_EE_V1'
  );
});

test('a report about a book with no repo recorded reports null, not "undefined/undefined"', () => {
  assert.equal(enrichReport(raw(), { bookSummary: { label: 'x' } }).repo, null);
  assert.equal(enrichReport(raw(), {}).repo, null);
});

test('the repo is searchable, so an admin can find every report against one repo', () => {
  const reports = [enriched(), enriched({ id: 'b', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')];
  assert.deepEqual(
    filterReports(reports, { search: 'PrepFusion_Network_Theory_EE_V1' }).map((r) => r.id),
    ['b']
  );
  assert.equal(filterReports(reports, { search: 'prepfusiongatepyq' }).length, 2);
});

test('a grouped row carries the repo through', () => {
  const [group] = groupByQuestion([enriched()]);
  assert.equal(group.repo, 'prepfusiongatepyq/PrepFusion_Digital_Electronics_EC_V1');
});

// A book can be deleted while reports about it survive; hiding those would
// quietly lose a user's bug report.
test('a report about a deleted book still renders, flagged as orphaned', () => {
  const report = enrichReport(raw(), {});
  assert.equal(report.orphaned, true);
  assert.equal(report.bookLabel, 'de_ec', 'falls back to the id');
  assert.equal(report.chapterLabel, 'ch1_logic_gates');
  assert.equal(report.domain, null);
});

test('enrichment prefers the live catalog subject over nothing, and keeps a stored one', () => {
  assert.equal(enrichReport(raw({ subject: undefined }), { bookSummary: DE_BOOK }).subject, 'technical');
  assert.equal(enrichReport(raw({ subject: 'maths' }), { bookSummary: DE_BOOK }).subject, 'maths');
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

test('search finds a report by a field the report itself does not store', () => {
  const reports = [enriched(), enriched({ id: 'r2', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')];
  const hits = filterReports(reports, { search: 'network theory' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'r2');
});

test('search is case-insensitive and matches partial words', () => {
  const reports = [enriched()];
  for (const term of ['DIGITAL', 'digital electronics', 'Logic Gates', 'misprint', '1.22.1']) {
    assert.equal(filterReports(reports, { search: term }).length, 1, `expected a hit for "${term}"`);
  }
});

test('search matches the comment text, so an admin can find a phrase a user used', () => {
  const reports = [enriched(), enriched({ id: 'r2', comment: 'the figure is missing entirely' })];
  const hits = filterReports(reports, { search: 'figure is missing' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'r2');
});

test('an empty or whitespace search returns everything rather than nothing', () => {
  const reports = [enriched(), enriched({ id: 'r2' })];
  for (const term of ['', '   ', undefined, null]) {
    assert.equal(filterReports(reports, { search: term }).length, 2);
  }
});

test('a search matching nothing returns an empty list, not everything', () => {
  assert.equal(filterReports([enriched()], { search: 'zzzz-no-such-thing' }).length, 0);
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

test('reports filter by type, status, subject, domain and book', () => {
  const reports = [
    enriched({ id: 'a' }),
    enriched({ id: 'b', type: 'video_request', comment: null }),
    enriched({ id: 'c', status: 'resolved' }),
    enriched({ id: 'd', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')
  ];

  assert.deepEqual(filterReports(reports, { type: 'video_request' }).map((r) => r.id), ['b']);
  assert.deepEqual(filterReports(reports, { status: 'resolved' }).map((r) => r.id), ['c']);
  assert.deepEqual(filterReports(reports, { domain: 'Network Theory' }).map((r) => r.id), ['d']);
  assert.deepEqual(filterReports(reports, { bookId: 'nt_ee' }).map((r) => r.id), ['d']);
  assert.equal(filterReports(reports, { subject: 'technical' }).length, 4);
});

test('filters combine as AND, not OR', () => {
  const reports = [
    enriched({ id: 'a', type: 'video_request', status: 'open' }),
    enriched({ id: 'b', type: 'video_request', status: 'resolved' }),
    enriched({ id: 'c', type: 'question_issue', status: 'open' })
  ];
  const hits = filterReports(reports, { type: 'video_request', status: 'open' });
  assert.deepEqual(hits.map((r) => r.id), ['a']);
});

test('a filter combines with search', () => {
  const reports = [
    enriched({ id: 'a', type: 'video_request' }),
    enriched({ id: 'b', type: 'video_request', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')
  ];
  const hits = filterReports(reports, { type: 'video_request', search: 'network' });
  assert.deepEqual(hits.map((r) => r.id), ['b']);
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

test('sorting by a numeric column orders numerically, both directions', () => {
  const reports = [
    enriched({ id: 'a', year: 2015 }),
    enriched({ id: 'b', year: 2022 }),
    enriched({ id: 'c', year: 2008 })
  ];
  assert.deepEqual(sortReports(reports, 'year', 'asc').map((r) => r.year), [2008, 2015, 2022]);
  assert.deepEqual(sortReports(reports, 'year', 'desc').map((r) => r.year), [2022, 2015, 2008]);
});

// Plain string sorting puts "Chapter 10" before "Chapter 2", which reads as a
// bug to anyone scanning the table.
test('sorting text is natural, so 2 comes before 10', () => {
  const reports = [
    enriched({ id: 'a' }, DE_BOOK, 'Chapter 10'),
    enriched({ id: 'b' }, DE_BOOK, 'Chapter 2'),
    enriched({ id: 'c' }, DE_BOOK, 'Chapter 1')
  ];
  assert.deepEqual(
    sortReports(reports, 'chapterLabel', 'asc').map((r) => r.chapterLabel),
    ['Chapter 1', 'Chapter 2', 'Chapter 10']
  );
});

test('sorting by date works on the ISO strings we store', () => {
  const reports = [
    enriched({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' }),
    enriched({ id: 'b', createdAt: '2026-08-01T00:00:00.000Z' }),
    enriched({ id: 'c', createdAt: '2026-06-01T00:00:00.000Z' })
  ];
  assert.deepEqual(sortReports(reports, 'createdAt', 'desc').map((r) => r.id), ['b', 'a', 'c']);
});

test('an unknown sort field falls back to the default instead of scrambling the table', () => {
  const reports = [
    enriched({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' }),
    enriched({ id: 'b', createdAt: '2026-08-01T00:00:00.000Z' })
  ];
  assert.deepEqual(sortReports(reports, '; DROP TABLE', 'desc').map((r) => r.id), ['b', 'a']);
});

test('sorting does not mutate the caller array', () => {
  const reports = [enriched({ id: 'a', year: 2022 }), enriched({ id: 'b', year: 2008 })];
  const before = reports.map((r) => r.id);
  sortReports(reports, 'year', 'asc');
  assert.deepEqual(reports.map((r) => r.id), before);
});

test('rows with a missing value sort last rather than first', () => {
  const reports = [
    enriched({ id: 'a' }, null, null),
    enriched({ id: 'b' }, DE_BOOK, 'Logic Gates')
  ];
  const sorted = sortReports(reports, 'domain', 'asc');
  assert.equal(sorted[0].id, 'b');
  assert.equal(sorted[1].domain, null);
});

test('ties break consistently so the table does not reshuffle between renders', () => {
  const reports = [
    enriched({ id: 'b2', year: 2022 }),
    enriched({ id: 'a1', year: 2022 }),
    enriched({ id: 'c3', year: 2022 })
  ];
  const first = sortReports(reports, 'year', 'desc').map((r) => r.id);
  const second = sortReports(reports.slice().reverse(), 'year', 'desc').map((r) => r.id);
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// Video-request demand
// ---------------------------------------------------------------------------

test('video requests collapse per question and count distinct users', () => {
  const reports = [
    enriched({ id: 'r1', type: 'video_request', userId: 'u1' }),
    enriched({ id: 'r2', type: 'video_request', userId: 'u2' }),
    enriched({ id: 'r3', type: 'video_request', userId: 'u3', questionNum: 9 })
  ];
  const groups = groupByQuestion(reports);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].requestCount, 2, 'two users wanted the same question');
  assert.equal(groups[1].requestCount, 1);
});

test('one user cannot inflate demand for a question', () => {
  const reports = [
    enriched({ id: 'r1', type: 'video_request', userId: 'u1' }),
    enriched({ id: 'r2', type: 'video_request', userId: 'u1' })
  ];
  assert.equal(groupByQuestion(reports)[0].requestCount, 1);
});

test('the most-requested question comes first by default', () => {
  const reports = [
    enriched({ id: 'r1', type: 'video_request', userId: 'u1', questionNum: 1 }),
    enriched({ id: 'r2', type: 'video_request', userId: 'u1', questionNum: 2 }),
    enriched({ id: 'r3', type: 'video_request', userId: 'u2', questionNum: 2 }),
    enriched({ id: 'r4', type: 'video_request', userId: 'u3', questionNum: 2 })
  ];
  const groups = sortGroups(groupByQuestion(reports));
  assert.equal(groups[0].questionNum, 2);
  assert.equal(groups[0].requestCount, 3);
});

test('groups sort by request count in both directions', () => {
  const reports = [
    enriched({ id: 'r1', userId: 'u1', questionNum: 1 }),
    enriched({ id: 'r2', userId: 'u1', questionNum: 2 }),
    enriched({ id: 'r3', userId: 'u2', questionNum: 2 })
  ];
  const groups = groupByQuestion(reports);
  assert.deepEqual(sortGroups(groups, 'requestCount', 'desc').map((g) => g.requestCount), [2, 1]);
  assert.deepEqual(sortGroups(groups, 'requestCount', 'asc').map((g) => g.requestCount), [1, 2]);
});

test('equal request counts break on recency, so the fresher question is higher', () => {
  const reports = [
    enriched({ id: 'r1', userId: 'u1', questionNum: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
    enriched({ id: 'r2', userId: 'u2', questionNum: 2, createdAt: '2026-08-01T00:00:00.000Z' })
  ];
  const groups = sortGroups(groupByQuestion(reports), 'requestCount', 'desc');
  assert.equal(groups[0].questionNum, 2);
});

test('groups can be sorted by the other table columns', () => {
  const reports = [
    enriched({ id: 'r1', userId: 'u1', questionNum: 1, year: 2022 }),
    enriched({ id: 'r2', userId: 'u2', questionNum: 2, year: 1997 })
  ];
  const groups = groupByQuestion(reports);
  assert.deepEqual(sortGroups(groups, 'year', 'asc').map((g) => g.year), [1997, 2022]);
});

test('an unknown group sort falls back to request count, not to nothing', () => {
  const reports = [
    enriched({ id: 'r1', userId: 'u1', questionNum: 1 }),
    enriched({ id: 'r2', userId: 'u1', questionNum: 2 }),
    enriched({ id: 'r3', userId: 'u2', questionNum: 2 })
  ];
  const groups = sortGroups(groupByQuestion(reports), 'nonsense; drop table', 'desc');
  assert.equal(groups[0].requestCount, 2);
});

test('a group carries the report ids behind it, so resolving can delete them all', () => {
  const reports = [
    enriched({ id: 'r1', userId: 'u1' }),
    enriched({ id: 'r2', userId: 'u2' })
  ];
  const [group] = groupByQuestion(reports);
  assert.deepEqual(group.reportIds.sort(), ['r1', 'r2']);
  assert.equal(group.type, 'question_issue');
});

test('a group spans only one question, never merging two', () => {
  const reports = [
    enriched({ id: 'r1', userId: 'u1', questionNum: 1 }),
    enriched({ id: 'r2', userId: 'u2', questionNum: 1, year: 2015 })
  ];
  // Same question number but a different year is a different question.
  assert.equal(groupByQuestion(reports).length, 2);
});

test('grouping keeps the comments people left', () => {
  const reports = [
    enriched({ id: 'r1', type: 'video_request', userId: 'u1', comment: 'the algebra is hard' }),
    enriched({ id: 'r2', type: 'video_request', userId: 'u2', comment: null })
  ];
  assert.deepEqual(groupByQuestion(reports)[0].comments, ['the algebra is hard']);
});

// ---------------------------------------------------------------------------
// Summary and facets
// ---------------------------------------------------------------------------

test('the summary counts totals and how many are still open, per type', () => {
  const reports = [
    enriched({ id: 'a', type: 'question_issue', status: 'open' }),
    enriched({ id: 'b', type: 'question_issue', status: 'resolved' }),
    enriched({ id: 'c', type: 'video_request', status: 'open' })
  ];
  const summary = summarise(reports);

  assert.equal(summary.question_issue.total, 2);
  assert.equal(summary.question_issue.open, 1);
  assert.equal(summary.video_request.open, 1);
  assert.equal(summary.solution_issue.total, 0, 'every type appears even at zero');
});

test('facets offer only values actually present, so no filter returns nothing', () => {
  const reports = [
    enriched({ id: 'a' }),
    enriched({ id: 'b', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')
  ];
  const f = facets(reports);

  assert.deepEqual(f.subjects, ['technical']);
  assert.equal(f.books.length, 2);
  assert.ok(f.books.every((b) => b.bookId && b.label));
});

// Only technical books have a domain or branch, so offering them as filters
// silently excludes every maths and aptitude book.
test('domain and branch are not offered as filters', () => {
  const f = facets([enriched(), enriched({ id: 'b', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')]);
  assert.equal(f.domains, undefined);
  assert.equal(f.branches, undefined);
});

// They stay searchable though — typing "network theory" should still find the
// technical books that do have one.
test('domain remains reachable through free-text search', () => {
  const reports = [enriched(), enriched({ id: 'b', bookId: 'nt_ee' }, NT_BOOK, 'Basic Concepts')];
  assert.deepEqual(filterReports(reports, { search: 'network theory' }).map((r) => r.id), ['b']);
});

// ---------------------------------------------------------------------------
// Difficulty ratings
// ---------------------------------------------------------------------------

function rating(overrides = {}) {
  return enrichReport(
    {
      id: overrides.id || 'x1',
      userId: overrides.userId || 'u1',
      rating: 'easy',
      bookId: 'de_ec',
      fileId: 'ch1_logic_gates',
      year: 2022,
      questionNum: 1,
      questionId: '1.22.1',
      updatedAt: '2026-08-01T10:00:00.000Z',
      ...overrides
    },
    { bookSummary: DE_BOOK, chapterLabel: 'Logic Gates' }
  );
}

test('ratings collapse per question into a distribution', () => {
  const groups = groupRatings([
    rating({ id: 'a', userId: 'u1', rating: 'easy' }),
    rating({ id: 'b', userId: 'u2', rating: 'hard' }),
    rating({ id: 'c', userId: 'u3', rating: 'hard' })
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].easy, 1);
  assert.equal(groups[0].medium, 0);
  assert.equal(groups[0].hard, 2);
  assert.equal(groups[0].ratingCount, 3);
});

test('the consensus is the most-chosen level', () => {
  const [group] = groupRatings([
    rating({ id: 'a', userId: 'u1', rating: 'medium' }),
    rating({ id: 'b', userId: 'u2', rating: 'medium' }),
    rating({ id: 'c', userId: 'u3', rating: 'easy' })
  ]);
  assert.equal(group.consensus, 'medium');
});

// A question half the readers found hard is worth surfacing, so a tie leans
// towards the harder verdict rather than the gentler one.
test('a tied vote resolves towards the harder level', () => {
  const [group] = groupRatings([
    rating({ id: 'a', userId: 'u1', rating: 'easy' }),
    rating({ id: 'b', userId: 'u2', rating: 'hard' })
  ]);
  assert.equal(group.consensus, 'hard');
});

test('the difficulty score spans 1 (all easy) to 3 (all hard)', () => {
  const allEasy = groupRatings([rating({ id: 'a', userId: 'u1', rating: 'easy' })]);
  const allHard = groupRatings([rating({ id: 'b', userId: 'u2', rating: 'hard' })]);
  const mixed = groupRatings([
    rating({ id: 'c', userId: 'u1', rating: 'easy' }),
    rating({ id: 'd', userId: 'u2', rating: 'hard' })
  ]);

  assert.equal(allEasy[0].difficultyScore, 1);
  assert.equal(allHard[0].difficultyScore, 3);
  assert.equal(mixed[0].difficultyScore, 2);
});

test('two different questions stay two rows', () => {
  const groups = groupRatings([
    rating({ id: 'a', userId: 'u1', questionNum: 1 }),
    rating({ id: 'b', userId: 'u1', questionNum: 2 })
  ]);
  assert.equal(groups.length, 2);
});

test('an unrecognised rating value is ignored rather than counted', () => {
  const [group] = groupRatings([
    rating({ id: 'a', userId: 'u1', rating: 'easy' }),
    rating({ id: 'b', userId: 'u2', rating: 'impossible' })
  ]);
  assert.equal(group.ratingCount, 1);
});

test('rating rows carry the enriched labels the table shows', () => {
  const [group] = groupRatings([rating()]);
  assert.equal(group.bookLabel, 'PrepFusion Digital Electronics EC');
  assert.equal(group.chapterLabel, 'Logic Gates');
  assert.equal(group.repo, 'prepfusiongatepyq/PrepFusion_Digital_Electronics_EC_V1');
});

test('rating groups sort by count and by difficulty, both directions', () => {
  const groups = groupRatings([
    rating({ id: 'a', userId: 'u1', questionNum: 1, rating: 'easy' }),
    rating({ id: 'b', userId: 'u1', questionNum: 2, rating: 'hard' }),
    rating({ id: 'c', userId: 'u2', questionNum: 2, rating: 'hard' })
  ]);

  assert.deepEqual(sortRatingGroups(groups, 'ratingCount', 'desc').map((g) => g.ratingCount), [2, 1]);
  assert.deepEqual(sortRatingGroups(groups, 'ratingCount', 'asc').map((g) => g.ratingCount), [1, 2]);
  assert.equal(sortRatingGroups(groups, 'difficultyScore', 'desc')[0].consensus, 'hard');
  assert.equal(sortRatingGroups(groups, 'difficultyScore', 'asc')[0].consensus, 'easy');
});

test('an unknown rating sort falls back to the count', () => {
  const groups = groupRatings([
    rating({ id: 'a', userId: 'u1', questionNum: 1 }),
    rating({ id: 'b', userId: 'u1', questionNum: 2 }),
    rating({ id: 'c', userId: 'u2', questionNum: 2 })
  ]);
  assert.equal(sortRatingGroups(groups, 'nonsense', 'desc')[0].ratingCount, 2);
});
