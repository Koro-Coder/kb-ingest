import { Fragment, useState } from 'react';
import { getBook, syncBook, deleteBook } from '../api.js';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function BookList({ books, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');

  const handleSync = async (bookId) => {
    setBusyId(bookId);
    try {
      await syncBook(bookId);
      await onChanged();
      if (expandedId === bookId) {
        await loadDetail(bookId);
      }
    } catch (error) {
      window.alert(`Sync failed: ${error.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (bookId) => {
    if (!window.confirm(`Remove "${bookId}" from the knowledge base?`)) return;
    setBusyId(bookId);
    try {
      await deleteBook(bookId);
      await onChanged();
      if (expandedId === bookId) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (error) {
      window.alert(`Delete failed: ${error.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const loadDetail = async (bookId) => {
    setDetailError('');
    try {
      const book = await getBook(bookId);
      setDetail(book);
    } catch (error) {
      setDetailError(error.message);
    }
  };

  const toggleExpand = async (bookId) => {
    if (expandedId === bookId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(bookId);
    setDetail(null);
    await loadDetail(bookId);
  };

  if (books.length === 0) {
    return <p className="muted">No books registered yet — add one above.</p>;
  }

  return (
    <table className="book-table">
      <thead>
        <tr>
          <th>Book</th>
          <th>Subject</th>
          <th>Domain / Branch</th>
          <th>Questions</th>
          <th>Warnings</th>
          <th>Last synced</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {books.map((b) => (
          <Fragment key={b.bookId}>
            <tr className={busyId === b.bookId ? 'busy' : ''}>
              <td>
                <button className="link" onClick={() => toggleExpand(b.bookId)}>
                  {b.label || b.bookId}
                </button>
                <div className="muted small">{b.repo?.owner}/{b.repo?.name}</div>
              </td>
              <td>{b.subject}</td>
              <td>{[b.domain, b.branch].filter(Boolean).join(' · ') || '—'}</td>
              <td>{b.questionCount}</td>
              <td className={b.warningCount > 0 ? 'warn' : ''}>{b.warningCount}</td>
              <td className="small">{formatTime(b.lastSyncedAt)}</td>
              <td className="actions">
                <button onClick={() => handleSync(b.bookId)} disabled={busyId === b.bookId}>
                  Re-sync
                </button>
                <button className="danger" onClick={() => handleDelete(b.bookId)} disabled={busyId === b.bookId}>
                  Delete
                </button>
              </td>
            </tr>
            {expandedId === b.bookId && (
              <tr className="detail-row">
                <td colSpan={7}>
                  {detailError && <p className="error">{detailError}</p>}
                  {!detailError && !detail && <p className="muted">Loading…</p>}
                  {detail && <BookDetail book={detail} />}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function BookDetail({ book }) {
  const filesWithWarnings = (book.files || []).filter((f) => (f.warnings || []).length > 0);
  return (
    <div className="detail">
      <p className="muted small">
        Parser profile: <code>{book.parserProfile}</code> · Root path: <code>{book.repo?.rootPath || '(repo root)'}</code> ·
        Branch: <code>{book.repo?.branch}</code>
      </p>
      <p className="muted small">{book.files?.length || 0} tex files indexed.</p>
      {filesWithWarnings.length === 0 && <p className="muted">No parse warnings.</p>}
      {filesWithWarnings.length > 0 && (
        <div className="warnings">
          <div className="section-head">
            <h4>Warnings</h4>
            <a className="button-link" href={`/api/books/${book.bookId}/warnings.csv`} download>
              Download this book's warnings (CSV)
            </a>
          </div>
          {filesWithWarnings.map((f) => (
            <div key={f.fileId} className="warning-file">
              <strong>{f.fileId}</strong>
              <ul>
                {f.warnings.map((w, idx) => (
                  <li key={idx}>
                    {w.excluded && <span className="tag tag-excluded">Not rendered</span>}
                    <span className="warn">{w.message}</span>
                    {w.raw && <pre>{w.raw}</pre>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
