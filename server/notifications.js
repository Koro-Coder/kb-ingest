// Turning resolved reports into the notifications their authors see.
//
// Pure: it maps report rows to notification rows and says nothing about how
// either is stored, so the interesting rules — one notification per person per
// resolution, and the right wording per report type — are testable directly.

// What resolving each kind of report actually means to the person who filed it.
const OUTCOMES = {
  question_issue: {
    type: 'question_updated',
    title: 'Question updated',
    body: 'The question you reported has been updated.'
  },
  solution_issue: {
    type: 'solution_updated',
    title: 'Solution updated',
    body: 'The solution you reported has been updated.'
  },
  video_request: {
    type: 'video_uploaded',
    title: 'Video solution added',
    body: 'A video solution is now available for the question you asked about.'
  }
};

function notificationId(userId, reportType, report, at) {
  return `${userId}::${reportType}::${report.bookId}::${report.fileId}|${report.year}|${report.questionNum}::${at}`;
}

// One notification per distinct user. A person who filed both a question and a
// solution report about the same question is told about each separately —
// those are different outcomes — but resolving one report never notifies the
// same person twice.
function notificationsFor(reports, at) {
  const outcome = OUTCOMES[reports.length ? reports[0].type : null];
  if (!outcome) {
    return [];
  }

  const seen = new Set();
  const notifications = [];

  for (const report of reports) {
    if (!report.userId || seen.has(report.userId)) {
      continue;
    }
    seen.add(report.userId);
    notifications.push({
      id: notificationId(report.userId, outcome.type, report, at),
      userId: report.userId,
      type: outcome.type,
      title: outcome.title,
      body: outcome.body,
      // The question this is about, plus the hints needed to link straight to
      // it without the reader having to hunt for it.
      bookId: report.bookId,
      fileId: report.fileId,
      year: report.year,
      questionNum: report.questionNum,
      subject: report.subject || null,
      ordinal: report.ordinal || null,
      questionId: report.questionId || null,
      label: report.label || null,
      createdAt: at,
      readAt: null
    });
  }

  return notifications;
}

module.exports = { notificationsFor, OUTCOMES };
