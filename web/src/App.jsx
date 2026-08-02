import { useEffect, useState } from 'react';
import AppHeader from './components/AppHeader.jsx';
import BookForm from './components/BookForm.jsx';
import BookList from './components/BookList.jsx';
import AnalyticsPanel from './components/AnalyticsPanel.jsx';
import AdminsPanel from './components/AdminsPanel.jsx';
import { listBooks, registerBook, downloadCsv } from './api.js';
import { useAuth } from './auth.jsx';

export default function App() {
  const { isOwner } = useAuth();
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
    <>
      <AppHeader tab={tab} onTab={setTab} />

      <div className="app">
        <div className="page-head">
          <div>
            <h1>Knowledge base</h1>
            <p className="lede">
              Register a GitHub repo of LaTeX question banks, sync it into the shared knowledge base,
              and watch what readers report back.
            </p>
          </div>

          {/* The counts belong to the books, so they stay put across tabs
              rather than becoming two different meanings of the same box. The
              book count is not among them — the table below is the answer to
              "how many books", and repeating it here said nothing new. */}
          <div className="statbox">
            <div>
              <b>{totalQuestions}</b>
              <span>Questions</span>
            </div>
            <div className={totalWarnings > 0 ? 'is-warn' : undefined}>
              <b>{totalWarnings}</b>
              <span>Warnings</span>
            </div>
          </div>
        </div>

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
    </>
  );
}
