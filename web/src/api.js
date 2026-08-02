const BASE = '/api/books';

// Every call now needs the admin bearer token. Rather than thread authFetch
// through every component, the AuthProvider registers it here once — it also
// handles refreshing an expired token and retrying.
let authFetch = (path, options) => fetch(path, options);

export function setAuthFetch(fn) {
  authFetch = fn;
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return authFetch(path, { ...options, headers });
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  return query.toString() ? `?${query}` : '';
}

// --- Books -----------------------------------------------------------------

export function listBooks() {
  return request(BASE).then(handle);
}

export function getBook(bookId) {
  return request(`${BASE}/${bookId}`).then(handle);
}

// The subjects the parser actually supports, so the form cannot offer one the
// server would reject.
export function listSubjects() {
  return request(`${BASE}/subjects`).then(handle);
}

export function registerBook(payload) {
  return request(BASE, { method: 'POST', body: JSON.stringify(payload) }).then(handle);
}

export function syncBook(bookId) {
  return request(`${BASE}/${bookId}/sync`, { method: 'POST' }).then(handle);
}

export function deleteBook(bookId) {
  return request(`${BASE}/${bookId}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete failed (${res.status})`);
    }
  });
}

// CSV upload posts raw text, so it sets its own content type.
export function uploadVideosCsv(bookId, text) {
  return request(`${BASE}/${bookId}/videos.csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: text
  }).then(handle);
}

// A download has to carry the token too, so it is fetched and turned into a
// blob rather than being a plain <a href> the browser fetches unauthenticated.
export async function downloadCsv(path, filename) {
  const res = await request(path);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Analytics -------------------------------------------------------------

export function listReportedQuestions(params = {}) {
  return request(`/api/reports/questions${queryString(params)}`).then(handle);
}

export function listRatedQuestions(params = {}) {
  return request(`/api/reports/ratings${queryString(params)}`).then(handle);
}

export function getReportSummary() {
  return request('/api/reports/summary').then(handle);
}

export function getQuestionReports(params) {
  return request(`/api/reports/question${queryString(params)}`).then(handle);
}

export function resolveQuestionReports(params) {
  return request(`/api/reports/question${queryString(params)}`, { method: 'DELETE' }).then(handle);
}

// --- Administrators (owner only) -------------------------------------------

export function listAdmins() {
  return request('/api/admins').then(handle);
}

export function grantAdmin({ email, role }) {
  return request('/api/admins', { method: 'POST', body: JSON.stringify({ email, role }) }).then(handle);
}

export function setAdminRole(email, role) {
  return request(`/api/admins/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role })
  }).then(handle);
}

export function removeAdmin(email) {
  return request(`/api/admins/${encodeURIComponent(email)}`, { method: 'DELETE' }).then(handle);
}
