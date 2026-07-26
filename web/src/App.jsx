import { useEffect, useState } from 'react';
import BookForm from './components/BookForm.jsx';
import BookList from './components/BookList.jsx';
import { listBooks, registerBook } from './api.js';

export default function App() {
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
      <header>
        <h1>PrepFusion Knowledge Base — Ingest</h1>
        <p className="muted">
          {books.length} books · {totalQuestions} questions · {totalWarnings} warnings
        </p>
      </header>

      <BookForm onSubmit={handleRegister} submitting={submitting} error={submitError} />

      <section className="card">
        <div className="section-head">
          <h2>Registered books</h2>
          {totalWarnings > 0 && (
            <a className="button-link" href="/api/books/warnings.csv" download>
              Download all warnings (CSV)
            </a>
          )}
        </div>
        {loading && <p className="muted">Loading…</p>}
        {loadError && <p className="error">{loadError}</p>}
        {!loading && !loadError && <BookList books={books} onChanged={refresh} />}
      </section>
    </div>
  );
}
