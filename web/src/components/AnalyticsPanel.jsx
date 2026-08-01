import { useCallback, useEffect, useState } from 'react';
import { listReportedQuestions, getReportSummary } from '../api.js';
import QuestionReportDetail from './QuestionReportDetail.jsx';

// The three analytics tables. They differ only in which report type they show
// and whether they offer the resolve action, so they share one component.
const TABS = [
  { type: 'question_issue', label: 'Question reported' },
  { type: 'solution_issue', label: 'Solution reported' },
  { type: 'video_request', label: 'Video requested' }
];

// Domain and branch are deliberately absent: only technical books have them,
// so the columns are blank for maths and aptitude. The book label already
// carries that information where it exists.
const COLUMNS = [
  { key: 'requestCount', label: 'Requests' },
  { key: 'subject', label: 'Subject' },
  { key: 'repo', label: 'Repo' },
  { key: 'bookLabel', label: 'Book' },
  { key: 'chapterLabel', label: 'Chapter' },
  { key: 'questionId', label: 'Question' },
  { key: 'year', label: 'Year' },
  { key: 'latestAt', label: 'Last raised' }
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function AnalyticsPanel() {
  const [type, setType] = useState('question_issue');
  const [filters, setFilters] = useState({ search: '', subject: '', bookId: '' });
  // Most-requested first is the default everywhere — it is the reason these
  // tables are grouped per question rather than listed per report.
  const [sort, setSort] = useState('requestCount');
  const [dir, setDir] = useState('desc');

  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshSummary = useCallback(() => {
    getReportSummary()
      .then(setSummary)
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listReportedQuestions({ type, ...filters, sort, dir }));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [type, filters, sort, dir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const toggleSort = (key) => {
    if (sort === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      // Counts and dates are most useful largest-first; text is not.
      setDir(key === 'requestCount' || key === 'latestAt' || key === 'year' ? 'desc' : 'asc');
    }
  };

  const switchTab = (nextType) => {
    setType(nextType);
    setSelected(null);
    setSort('requestCount');
    setDir('desc');
  };

  const facets = (data && data.facets) || { subjects: [], books: [] };
  const hasFilters = filters.search || filters.subject || filters.bookId;

  if (selected) {
    return (
      <section className="card">
        <QuestionReportDetail
          target={selected}
          onBack={() => setSelected(null)}
          onResolved={() => {
            setSelected(null);
            refresh();
            refreshSummary();
          }}
        />
      </section>
    );
  }

  return (
    <section className="card">
      <nav className="subtabs">
        {TABS.map((tab) => (
          <button
            key={tab.type}
            className={type === tab.type ? 'active' : ''}
            onClick={() => switchTab(tab.type)}
          >
            {tab.label}
            {summary && summary[tab.type] && (
              <span className="subtab-count">{summary[tab.type].questions}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search book, subject, chapter, question or comment…"
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
        />
        <select value={filters.subject} onChange={(e) => update('subject', e.target.value)}>
          <option value="">All subjects</option>
          {facets.subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filters.bookId} onChange={(e) => update('bookId', e.target.value)}>
          <option value="">All books</option>
          {facets.books.map((b) => (
            <option key={b.bookId} value={b.bookId}>
              {b.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button className="link" onClick={() => setFilters({ search: '', subject: '', bookId: '' })}>
            Clear
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !data && <p className="muted">Loading…</p>}

      {data && (
        <>
          <p className="muted small">
            {data.matchedQuestions} question{data.matchedQuestions === 1 ? '' : 's'}
            {hasFilters && ` of ${data.totalQuestions}`} · {data.totalReports} report
            {data.totalReports === 1 ? '' : 's'} in total
          </p>

          {data.matchedQuestions === 0 ? (
            <p className="muted">
              {hasFilters ? 'Nothing matches these filters.' : 'Nothing reported here yet.'}
            </p>
          ) : (
            <div className="table-scroll">
              {/* questions-table carries the per-column widths; the detail
                  view reuses .report-table and must not inherit them. */}
              <table className="report-table questions-table">
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} className="sortable" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        {sort === col.key && <span className="sort-arrow">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.questions.map((q) => (
                    <tr
                      key={q.key}
                      className={`clickable${q.orphaned ? ' orphaned' : ''}`}
                      onClick={() => setSelected(q)}
                    >
                      <td>
                        <span className="demand-count">{q.requestCount}</span>
                      </td>
                      <td>{q.subject || '—'}</td>
                      <td className="repo-cell">
                        {q.repo ? (
                          // Stop the row's own click handler so opening the
                          // repo doesn't also open the detail view.
                          <a
                            href={`https://github.com/${q.repo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={q.repo}
                          >
                            {q.repo}
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td title={q.bookId}>
                        {q.bookLabel}
                        {q.orphaned && <span className="muted small"> (book removed)</span>}
                      </td>
                      <td>{q.chapterLabel}</td>
                      <td>{q.questionId ? `Q${q.questionId}` : `Q${q.questionNum}`}</td>
                      <td>{q.year}</td>
                      {/* No "view details" affordance: the whole row is the
                          click target, and the hover highlight says so. */}
                      <td className="nowrap">{formatDate(q.latestAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {type === 'video_request' && (
            <p className="muted small">
              Requests disappear on their own once a video link exists for the question — add one via
              the videos CSV on the Books tab.
            </p>
          )}
        </>
      )}
    </section>
  );
}
