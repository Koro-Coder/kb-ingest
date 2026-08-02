import { useCallback, useEffect, useState } from 'react';
import { listRatedQuestions } from '../api.js';

// Difficulty as readers actually experienced it, per question. Unlike the
// report tables there is nothing to resolve here — a rating is an observation,
// not a task — so the table is read-only.
const COLUMNS = [
  { key: 'ratingCount', label: 'Ratings' },
  { key: 'consensus', label: 'Consensus' },
  { key: 'difficultyScore', label: 'Score' },
  { key: null, label: 'Spread' },
  { key: 'subject', label: 'Subject' },
  { key: 'repo', label: 'Repo' },
  { key: 'bookLabel', label: 'Book' },
  { key: 'chapterLabel', label: 'Chapter' },
  { key: 'questionId', label: 'Question' },
  { key: 'year', label: 'Year' }
];

export default function RatingsPanel({ filters, onFilterChange, onFacets }) {
  const [sort, setSort] = useState('ratingCount');
  const [dir, setDir] = useState('desc');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRatedQuestions({ ...filters, sort, dir });
      setData(result);
      if (onFacets) onFacets(result.facets);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, sort, dir, onFacets]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleSort = (key) => {
    if (!key) return;
    if (sort === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setDir(key === 'subject' || key === 'bookLabel' || key === 'chapterLabel' ? 'asc' : 'desc');
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (loading && !data) return <p className="muted">Loading…</p>;
  if (!data) return null;

  const { totals } = data;
  const totalRatings = data.totalRatings || 0;

  return (
    <>
      <div className="summary-row">
        {['easy', 'medium', 'hard'].map((level) => (
          <span key={level} className={`summary-chip rating-chip rating-${level}`}>
            <strong>{totals[level]}</strong>
            <span className="chip-label">{level}</span>
          </span>
        ))}
        <span className="summary-chip">
          <strong>{data.totalQuestions}</strong>
          <span className="chip-label">questions rated</span>
        </span>
      </div>

      <p className="muted small">
        {data.matchedQuestions} question{data.matchedQuestions === 1 ? '' : 's'} · {totalRatings} rating
        {totalRatings === 1 ? '' : 's'} in total. Score runs 1 (everyone found it easy) to 3 (everyone
        found it hard).
      </p>

      {data.matchedQuestions === 0 ? (
        <p className="muted">No ratings yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="report-table questions-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    className={col.key ? 'sortable' : undefined}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sort === col.key && <span className="sort-arrow">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.questions.map((q) => (
                <tr key={q.key} className={q.orphaned ? 'orphaned' : undefined}>
                  <td>
                    <span className="demand-count">{q.ratingCount}</span>
                  </td>
                  <td>
                    <span className={`status-badge rating-${q.consensus}`}>{q.consensus}</span>
                  </td>
                  <td>{q.difficultyScore}</td>
                  <td className="nowrap">
                    {/* A stacked bar reads faster than three numbers when
                        scanning for questions readers disagree about. */}
                    <span className="spread" title={`easy ${q.easy} · medium ${q.medium} · hard ${q.hard}`}>
                      {['easy', 'medium', 'hard'].map((level) =>
                        q[level] ? (
                          <span
                            key={level}
                            className={`spread-part rating-${level}`}
                            style={{ flexGrow: q[level] }}
                          >
                            {q[level]}
                          </span>
                        ) : null
                      )}
                    </span>
                  </td>
                  <td>{q.subject || '—'}</td>
                  <td className="repo-cell">
                    {q.repo ? (
                      <a href={`https://github.com/${q.repo}`} target="_blank" rel="noopener noreferrer">
                        {q.repo}
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {q.bookLabel}
                    {q.orphaned && <span className="muted small"> (book removed)</span>}
                  </td>
                  <td>{q.chapterLabel}</td>
                  <td>{q.questionId ? `Q${q.questionId}` : `Q${q.questionNum}`}</td>
                  <td>{q.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
