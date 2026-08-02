import { useEffect, useState } from 'react';
import { getQuestionReports, resolveQuestionReports } from '../api.js';

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 16);
}

// The dug-in view behind one table row: the question it concerns, and every
// individual report filed against it with the person who filed it.
export default function QuestionReportDetail({ target, onBack, onResolved }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const params = {
    type: target.type,
    bookId: target.bookId,
    fileId: target.fileId,
    year: target.year,
    questionNum: target.questionNum
  };

  useEffect(() => {
    getQuestionReports(params)
      .then(setData)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.type, target.bookId, target.fileId, target.year, target.questionNum]);

  const isVideo = target.type === 'video_request';

  const resolve = async () => {
    const count = data ? data.reports.length : 0;
    const confirmed = window.confirm(
      `Mark resolved and delete ${count} report${count === 1 ? '' : 's'} for this question?\n\n` +
        'This cannot be undone.'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await resolveQuestionReports(params);
      onResolved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const question = data && data.question;

  return (
    <div className="detail-view">
      <p className="muted small">
        <button className="link" onClick={onBack}>
          ← Back to {isVideo ? 'video requests' : 'reports'}
        </button>
      </p>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}

      {question && (
        <>
          <div className="detail-head">
            <div>
              <h3>
                {question.questionId ? `Q${question.questionId}` : `Question ${question.questionNum}`}
                <span className="muted"> · {question.year}</span>
              </h3>
              <p className="muted small">
                {question.subject} · {question.bookLabel} · {question.chapterLabel}
                {question.orphaned && <strong> · book removed</strong>}
              </p>
            </div>
            {!isVideo && (
              <button className="danger" onClick={resolve} disabled={busy}>
                Resolved — delete {data.reports.length} report{data.reports.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          <dl className="detail-facts">
            <div>
              <dt>Requests</dt>
              <dd>{question.requestCount}</dd>
            </div>
            <div>
              <dt>Repo</dt>
              <dd className="mono">
                {question.repo ? (
                  <a href={`https://github.com/${question.repo}`} target="_blank" rel="noopener noreferrer">
                    {question.repo}
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt>First raised</dt>
              <dd>{formatDateTime(question.firstAt)}</dd>
            </div>
            <div>
              <dt>Last raised</dt>
              <dd>{formatDateTime(question.latestAt)}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd className="mono">{question.fileId}</dd>
            </div>
            <div>
              <dt>Question no.</dt>
              <dd>{question.questionNum}</dd>
            </div>
            {isVideo && (
              <div>
                <dt>Video</dt>
                <dd>
                  {question.video ? (
                    <a href={question.video} target="_blank" rel="noopener noreferrer">
                      linked
                    </a>
                  ) : (
                    <span className="muted">none yet</span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {isVideo && (
            <p className="muted small">
              These clear themselves once a video link exists for this question — upload it on the
              Books tab via the videos CSV.
            </p>
          )}

          <h4>Who raised {isVideo ? 'this request' : 'this'}</h4>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Raised</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">
                      {r.user.avatarUrl && <img className="mini-avatar" src={r.user.avatarUrl} alt="" />}
                      {r.user.name || <span className="muted">unknown user</span>}
                    </td>
                    <td>{r.user.email || <span className="muted">—</span>}</td>
                    <td className="nowrap">{formatDateTime(r.createdAt)}</td>
                    <td>{r.comment || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
