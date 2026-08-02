import { useEffect, useState } from 'react';
import BookForm from './components/BookForm.jsx';
import BookList from './components/BookList.jsx';
import AnalyticsPanel from './components/AnalyticsPanel.jsx';
import AdminsPanel from './components/AdminsPanel.jsx';
import { listBooks, registerBook, downloadCsv } from './api.js';
import { useAuth } from './auth.jsx';

export default function App() {
  const { user, isOwner, signOut } = useAuth();
  const [tab, setTab] = useState('books');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const refresh = async () => {
    try {
      const data = await listBooks();
      setBooks(data);
      setLoadError('');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleRegister = async (payload) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await registerBook(payload);
      await refresh();
      return true;
    } catch (error) {
      setSubmitError(error.message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const totalQuestions = books.reduce((sum, b) => sum + (b.questionCount || 0), 0);
  const totalWarnings = books.reduce((sum, b) => sum + (b.warningCount || 0), 0);

  return (
    <div className="app">
      <div className="account-bar">
        {user && (
          <>
            <span className="account-user" title={user.email}>
              {user.avatarUrl && <img className="avatar" src={user.avatarUrl} alt="" />}
              {user.name || user.email}
            </span>
            <span className={`status-badge status-${isOwner ? 'reviewing' : 'open'}`}>{user.role}</span>
            <button className="link" onClick={signOut}>
              Sign out
            </button>
          </>
        )}
      </div>

      <header>
        <h1>PrepFusion Knowledge Base — Ingest</h1>
        <p className="muted">
          {books.length} books · {totalQuestions} questions · {totalWarnings} warnings
        </p>
      </header>

      <nav className="tabs">
        <button className={tab === 'books' ? 'active' : ''} onClick={() => setTab('books')}>
          Books
        </button>
        <button className={tab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>
          Analytics
        </button>
        {/* Owner-only. The server refuses the underlying routes regardless, so
            hiding the tab is convenience, not the control. */}
        {isOwner && (
          <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>
            Administrators
          </button>
        )}
      </nav>

      {tab === 'books' && (
        <>
          <BookForm onSubmit={handleRegister} submitting={submitting} error={submitError} />

          <section className="card">
            <div className="section-head">
              <h2>Registered books</h2>
              {totalWarnings > 0 && (
                // Fetched with the bearer token rather than a plain href — the
                // browser would follow that link unauthenticated and get a 401.
                <button
                  className="button-link"
                  onClick={() => downloadCsv('/api/books/warnings.csv', 'prepfusion-warnings.csv')}
                >
                  Download all warnings (CSV)
                </button>
              )}
            </div>
            {loading && <p className="muted">Loading…</p>}
            {loadError && <p className="error">{loadError}</p>}
            {!loading && !loadError && <BookList books={books} onChanged={refresh} />}
          </section>
        </>
      )}

      {tab === 'analytics' && <AnalyticsPanel />}
      {tab === 'admins' && isOwner && <AdminsPanel />}
    </div>
  );
}
