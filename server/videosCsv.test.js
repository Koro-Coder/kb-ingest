const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVideosCsv, applyVideosCsv, parseCsv, isAcceptableVideoUrl } = require('./videosCsv');

const book = {
  bookId: 'demo',
  label: 'Demo Book',
  files: [
    {
      fileId: '2021/Session1',
      questions: [
        { questionId: '1.21.1', year: 2021, questionNum: 1, questionType: 'MCQ', hasSolution: true, video: '' },
        { questionId: '1.21.2', year: 2021, questionNum: 2, questionType: 'NAT', hasSolution: true, video: 'https://youtu.be/existing123' },
        { questionId: '1.21.3', year: 2021, questionNum: 3, questionType: 'MCQ', hasSolution: false, video: '' }
      ]
    },
    {
      // Same question numbers in a different session — the export must keep
      // them as distinct rows, since aptitude ids repeat across sessions.
      fileId: '2021/Session2',
      questions: [
        { questionId: '1.21.1', year: 2021, questionNum: 1, questionType: 'MCQ', hasSolution: true, video: '' }
      ]
    }
  ]
};

test('export lists only solved questions and pre-fills links already in the source', () => {
  const csv = buildVideosCsv(book, {});
  const rows = parseCsv(csv);

  assert.equal(rows[0][0], 'Book');
  assert.equal(rows.length, 4, 'header + 3 solved questions (the unsolved one is omitted)');
  assert.ok(!csv.includes('1.21.3'), 'questions without a solution must not appear');

  const q2 = rows.find((r) => r[2] === '1.21.2');
  assert.equal(q2[6], 'https://youtu.be/existing123', 'a link from the LaTeX source is pre-filled');
});

test('a stored override takes precedence over the source link in the export', () => {
  const csv = buildVideosCsv(book, { '2021/Session1|2021|2': 'https://youtu.be/override99' });
  const q2 = parseCsv(csv).find((r) => r[2] === '1.21.2');
  assert.equal(q2[6], 'https://youtu.be/override99');
});

test('upload applies valid links and rejects non-YouTube / unknown rows without discarding the rest', () => {
  const csv = [
    '"Book","File","Question","Year","Question No","Type","Video URL"',
    '"Demo","2021/Session1","1.21.1","2021","1","MCQ","https://youtu.be/aaaaaaaaaaa"',
    '"Demo","2021/Session1","1.21.2","2021","2","NAT","https://vimeo.com/12345"',
    '"Demo","2021/Session1","9.99.9","2021","999","MCQ","https://youtu.be/bbbbbbbbbbb"',
    '"Demo","2021/Session2","1.21.1","2021","1","MCQ","https://www.youtube.com/watch?v=ccccccccccc"'
  ].join('\r\n');

  const result = applyVideosCsv(book, {}, csv);

  assert.equal(result.applied, 2, 'the two valid rows are saved');
  assert.equal(result.skipped, 2, 'the vimeo row and the unknown question are skipped');
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /not a YouTube URL/);
  assert.match(result.errors[1], /no question 999/);

  // Same question number, different session — these must not overwrite each other.
  assert.equal(result.videos['2021/Session1|2021|1'], 'https://youtu.be/aaaaaaaaaaa');
  assert.equal(result.videos['2021/Session2|2021|1'], 'https://www.youtube.com/watch?v=ccccccccccc');
});

test('a blank Video URL clears a previously stored link', () => {
  const existing = { '2021/Session1|2021|1': 'https://youtu.be/aaaaaaaaaaa' };
  const csv = [
    '"Book","File","Question","Year","Question No","Type","Video URL"',
    '"Demo","2021/Session1","1.21.1","2021","1","MCQ",""'
  ].join('\r\n');

  const result = applyVideosCsv(book, existing, csv);
  assert.equal(result.cleared, 1);
  assert.equal(result.videos['2021/Session1|2021|1'], undefined);
});

test('a CSV with the wrong columns is rejected outright rather than half-applied', () => {
  const csv = '"Something","Else"\r\n"a","b"';
  const result = applyVideosCsv(book, { keep: 'me' }, csv);
  assert.equal(result.applied, 0);
  assert.deepEqual(result.videos, { keep: 'me' }, 'existing overrides are left untouched');
  assert.match(result.errors[0], /Unexpected columns/);
});

test('the CSV reader handles quoted commas, newlines and doubled quotes', () => {
  const rows = parseCsv('"a,b","c""d","e\nf"\r\n"1","2","3"');
  assert.deepEqual(rows[0], ['a,b', 'c"d', 'e\nf']);
  assert.deepEqual(rows[1], ['1', '2', '3']);
});

// Regression: books synced before questionNum was stored produced a CSV with
// a blank "Question No", which then failed to upload with "no question 0".
const legacyBook = {
  bookId: 'legacy',
  label: 'Legacy Book',
  files: [
    {
      fileId: '2010/Session1',
      questions: [
        // No questionNum field at all — exactly what the old sync wrote.
        { questionId: '1.10.1', year: 2010, questionType: 'MCQ', hasSolution: true },
        { questionId: '1.10.4', year: 2010, questionType: 'MCQ', hasSolution: true }
      ]
    }
  ]
};

test('export derives the question number from the id when the stub predates that field', () => {
  const rows = parseCsv(buildVideosCsv(legacyBook, {}));
  const first = rows.find((r) => r[2] === '1.10.1');
  assert.equal(first[4], '1', 'Question No must not be blank');
  const second = rows.find((r) => r[2] === '1.10.4');
  assert.equal(second[4], '4');
});

test('upload still matches when the Question No column is blank, using the printed id', () => {
  const csv = [
    '"Book","File","Question","Year","Question No","Type","Video URL"',
    '"Legacy","2010/Session1","1.10.1","2010","","MCQ","https://www.youtube.com/watch?v=VyxA3mlvo84&t=170s"',
    '"Legacy","2010/Session1","1.10.4","2010","","MCQ","https://youtu.be/aaaaaaaaaaa"'
  ].join('\r\n');

  const result = applyVideosCsv(legacyBook, {}, csv);
  assert.equal(result.skipped, 0, 'a blank Question No must not break the match');
  assert.equal(result.applied, 2);
  assert.equal(result.videos['2010/Session1|2010|1'], 'https://www.youtube.com/watch?v=VyxA3mlvo84&t=170s');
  assert.equal(result.videos['2010/Session1|2010|4'], 'https://youtu.be/aaaaaaaaaaa');
});

test('a row that identifies no question at all is reported clearly', () => {
  const csv = [
    '"Book","File","Question","Year","Question No","Type","Video URL"',
    '"Legacy","2010/Session1","","2010","","MCQ","https://youtu.be/aaaaaaaaaaa"'
  ].join('\r\n');

  const result = applyVideosCsv(legacyBook, {}, csv);
  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 1);
  assert.match(result.errors[0], /could not identify the question/);
});

test('only YouTube hosts are accepted as video URLs', () => {
  assert.ok(isAcceptableVideoUrl('https://youtu.be/abc123'));
  assert.ok(isAcceptableVideoUrl('https://www.youtube.com/watch?v=abc123'));
  assert.ok(!isAcceptableVideoUrl('https://vimeo.com/1'));
  assert.ok(!isAcceptableVideoUrl('javascript:alert(1)'));
  assert.ok(!isAcceptableVideoUrl('not a url'));
});
