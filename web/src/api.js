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

export function deleteBook(bookId) {
  return fetch(`${BASE}/${bookId}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete failed (${res.status})`);
    }
  });
}
