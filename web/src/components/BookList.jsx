import { Fragment, useRef, useState } from 'react';
import { getBook, syncBook, deleteBook, uploadVideosCsv, downloadCsv } from '../api.js';

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
    // Scrolls rather than squeezing: the repo names are long enough to force
    // the other columns to wrap otherwise.
    <div className="table-scroll">
      <table className="book-table">
        <thead>
          <tr>
            <th>Book</th>
            <th>Subject</th>
            <th>Repo</th>
            <th>Questions</th>
            <th>Solutions</th>
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
                </td>
                <td>{b.subject}</td>
                <td className="repo-cell">
                  {b.repo?.owner && b.repo?.name ? (
                    <a
                      href={`https://github.com/${b.repo.owner}/${b.repo.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {b.repo.owner}/{b.repo.name}
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{b.questionCount}</td>
                <td>
                  {b.solutionRepo ? (
                    // Anything short of full coverage is worth flagging, since a
                    // question with no solution is a visible gap on the site.
                    <span className={b.solutionCount < b.questionCount ? 'warn' : ''}>
                      {b.solutionCount ?? 0}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
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
                  <td colSpan={8}>
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
    </div>
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
      <div className="chapter-index">
        <p className="muted small">
          {book.files?.length || 0} chapter{book.files?.length === 1 ? '' : 's'} indexed:
        </p>
        <ol className="chapter-list">
          {(book.files || []).map((file) => (
            <li key={file.fileId}>
              {file.label}
              <span className="muted small">
                {' '}
                · {file.questionCount ?? (file.questions || []).length} question
                {(file.questionCount ?? (file.questions || []).length) === 1 ? '' : 's'}
                {(file.warnings || []).length > 0 && (
                  <span className="warn"> · {file.warnings.length} warning(s)</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {book.solutionRepo && <VideoLinks book={book} />}

      {filesWithWarnings.length === 0 && <p className="muted">No parse warnings.</p>}
      {filesWithWarnings.length > 0 && (
        <div className="warnings">
          <div className="section-head">
            <h4>Warnings</h4>
            <button
              className="button-link"
              onClick={() =>
                downloadCsv(`/api/books/${book.bookId}/warnings.csv`, `${book.bookId}-warnings.csv`)
              }
            >
              Download this book's warnings (CSV)
            </button>
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

function VideoLinks({ book }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const solvedCount = (book.files || []).reduce(
    (sum, f) => sum + (f.questions || []).filter((q) => q.hasSolution).length,
    0
  );

  const handleUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      setStatus(await uploadVideosCsv(book.bookId, text));
    } catch (error) {
      setStatus({ errors: [error.message], applied: 0, cleared: 0, skipped: 0 });
    } finally {
      setBusy(false);
      // Reset so re-uploading the same filename still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="videos">
      <div className="section-head">
        <h4>Solution videos</h4>
        <div className="actions">
          <button
            className="button-link"
            onClick={() => downloadCsv(`/api/books/${book.bookId}/videos.csv`, `${book.bookId}-videos.csv`)}
          >
            Download video CSV
          </button>
          <button onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Upload filled CSV'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      <p className="muted small">
        {solvedCount} solved question{solvedCount === 1 ? '' : 's'}. Fill the <code>Video URL</code> column and upload
        the file back — links are stored here and survive re-syncs.
      </p>
      {status && (
        <div className="upload-result">
          <p>
            <strong>{status.applied}</strong> link(s) set
            {status.cleared > 0 && <> · <strong>{status.cleared}</strong> cleared</>}
            {status.skipped > 0 && <> · <span className="warn">{status.skipped} skipped</span></>}
            {typeof status.totalWithVideo === 'number' && <> · {status.totalWithVideo} total with a video</>}
          </p>
          {status.errors && status.errors.length > 0 && (
            <ul className="upload-errors">
              {status.errors.map((e, i) => (
                <li key={i} className="warn">{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
