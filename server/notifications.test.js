const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationsFor } = require('./notifications');

const AT = '2026-08-02T10:00:00.000Z';

function report(overrides = {}) {
  return {
    id: 'r1',
    userId: 'u1',
    type: 'question_issue',
    bookId: 'analog_ee',
    fileId: 'ch1_basics',
    year: 2022,
    questionNum: 3,
    subject: 'nexus_x',
    ordinal: 7,
    questionId: '1.22.3',
    label: 'Q1.22.3',
    ...overrides
  };
}

test('resolving a question report tells the reporter the question was updated', () => {
  const [n] = notificationsFor([report()], AT);
  assert.equal(n.type, 'question_updated');
  assert.equal(n.title, 'Question updated');
  assert.equal(n.userId, 'u1');
  assert.equal(n.readAt, null);
  assert.equal(n.createdAt, AT);
});

test('resolving a solution report says the solution was updated', () => {
  const [n] = notificationsFor([report({ type: 'solution_issue' })], AT);
  assert.equal(n.type, 'solution_updated');
  assert.equal(n.title, 'Solution updated');
});

test('clearing video requests says a video is now available', () => {
  const [n] = notificationsFor([report({ type: 'video_request' })], AT);
  assert.equal(n.type, 'video_uploaded');
  assert.match(n.title, /video/i);
});

// The notification has to be clickable, which means carrying enough to build
// the link without another lookup.
test('a notification carries everything needed to link to the question', () => {
  const [n] = notificationsFor([report()], AT);
  assert.equal(n.bookId, 'analog_ee');
  assert.equal(n.fileId, 'ch1_basics');
  assert.equal(n.year, 2022);
  assert.equal(n.questionNum, 3);
  assert.equal(n.subject, 'nexus_x');
  assert.equal(n.ordinal, 7);
  assert.equal(n.questionId, '1.22.3');
});

test('every reporter is told, not just the first', () => {
  const notifications = notificationsFor(
    [report({ id: 'a', userId: 'u1' }), report({ id: 'b', userId: 'u2' }), report({ id: 'c', userId: 'u3' })],
    AT
  );
  assert.deepEqual(notifications.map((n) => n.userId).sort(), ['u1', 'u2', 'u3']);
});

// Should the same person ever hold two rows for one question, resolving must
// not send them the same news twice.
test('one person is told once, however many rows they hold', () => {
  const notifications = notificationsFor(
    [report({ id: 'a', userId: 'u1' }), report({ id: 'b', userId: 'u1' })],
    AT
  );
  assert.equal(notifications.length, 1);
});

test('a report with no user is skipped rather than producing an orphan', () => {
  const notifications = notificationsFor([report({ userId: null }), report({ id: 'b', userId: 'u2' })], AT);
  assert.deepEqual(notifications.map((n) => n.userId), ['u2']);
});

test('nothing to resolve produces nothing', () => {
  assert.deepEqual(notificationsFor([], AT), []);
});

test('an unrecognised report type produces nothing rather than a blank notification', () => {
  assert.deepEqual(notificationsFor([report({ type: 'something_else' })], AT), []);
});

test('notification ids are distinct per user, so none overwrite each other', () => {
  const notifications = notificationsFor(
    [report({ id: 'a', userId: 'u1' }), report({ id: 'b', userId: 'u2' })],
    AT
  );
  assert.equal(new Set(notifications.map((n) => n.id)).size, 2);
});

// Resolving the same question twice (a problem that recurs) must not collide
// with the first notification's id.
test('resolving the same question again later creates a new notification', () => {
  const [first] = notificationsFor([report()], AT);
  const [second] = notificationsFor([report()], '2026-09-01T10:00:00.000Z');
  assert.notEqual(first.id, second.id);
});
