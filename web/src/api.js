const BASE = '/api/books';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function listBooks() {
  return fetch(BASE).then(handle);
}

export function getBook(bookId) {
  return fetch(`${BASE}/${bookId}`).then(handle);
}

export function registerBook(payload) {
  return fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(handle);
}

export function syncBook(bookId) {
  return fetch(`${BASE}/${bookId}/sync`, { method: 'POST' }).then(handle);
}

// --- Analytics -------------------------------------------------------------
// Grouping, filtering, search and sort all happen server-side, because
// searching by book or chapter label means searching fields the report itself
// never stored — they are joined from the catalog at read time.

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  return query.toString() ? `?${query}` : '';
}

// One row per question, counted by distinct user.
export function listReportedQuestions(params = {}) {
  return fetch(`/api/reports/questions${queryString(params)}`).then(handle);
}

export function getReportSummary() {
  return fetch('/api/reports/summary').then(handle);
}

// Everything behind one row: who filed it, when, and what they wrote.
export function getQuestionReports(params) {
  return fetch(`/api/reports/question${queryString(params)}`).then(handle);
}

// "Resolved" — deletes every report of this type for this question. There is
// no undo.
export function resolveQuestionReports(params) {
  return fetch(`/api/reports/question${queryString(params)}`, { method: 'DELETE' }).then(handle);
}

export function deleteBook(bookId) {
  return fetch(`${BASE}/${bookId}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete failed (${res.status})`);
    }
  });
}
