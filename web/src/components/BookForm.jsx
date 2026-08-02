import { useEffect, useState } from 'react';
import { listSubjects } from '../api.js';

// Only a fallback for the moment before the fetch lands — the real list comes
// from the server, so the dropdown can never drift from what the parser
// actually accepts.
const FALLBACK_SUBJECTS = [{ key: 'aptitude', label: 'Aptitude', requiresDomainBranch: false }];

const initialState = {
  repoUrl: '',
  subject: 'aptitude',
  label: '',
  domain: '',
  branch: '',
  rootPath: '',
  branchName: '',
  bookId: '',
  solutionRepoUrl: '',
  solutionRootPath: ''
};

export default function BookForm({ onSubmit, submitting, error }) {
  const [form, setForm] = useState(initialState);
  const [subjects, setSubjects] = useState(FALLBACK_SUBJECTS);

  useEffect(() => {
    listSubjects()
      .then((list) => {
        if (list.length) setSubjects(list);
      })
      .catch(() => {});
  }, []);

  // Whether domain/branch are needed follows the subject's repo layout, so it
  // comes from the server alongside the list rather than being a hardcoded
  // check for one subject name.
  const selected = subjects.find((s) => s.key === form.subject);
  const needsDomainBranch = Boolean(selected && selected.requiresDomainBranch);

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = { ...form };
    Object.keys(payload).forEach((key) => {
      if (payload[key] === '') delete payload[key];
    });
    const ok = await onSubmit(payload);
    if (ok) {
      setForm(initialState);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Register / sync a repo</h2>

      <label>
        Repo URL
        <input
          type="text"
          placeholder="https://github.com/prepfusiongatepyq/..."
          value={form.repoUrl}
          onChange={update('repoUrl')}
          required
        />
      </label>

      <div className="row">
        <label>
          Subject
          <select value={form.subject} onChange={update('subject')}>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Display label
          <input type="text" placeholder="(derived from repo name)" value={form.label} onChange={update('label')} />
        </label>
      </div>

      <label>
        Solutions repo URL <span className="muted small">— optional; mirrors the question repo's folders</span>
        <input
          type="text"
          placeholder="https://github.com/prepfusiongatepyq/..._Solutions_V1"
          value={form.solutionRepoUrl}
          onChange={update('solutionRepoUrl')}
        />
      </label>

      {needsDomainBranch && (
        <div className="row">
          <label>
            Domain
            <input type="text" placeholder="Network Theory" value={form.domain} onChange={update('domain')} required />
          </label>
          <label>
            Branch
            <input type="text" placeholder="EE" value={form.branch} onChange={update('branch')} required />
          </label>
        </div>
      )}

      <details>
        <summary>Advanced</summary>
        <div className="row">
          <label>
            Root path in repo
            <input
              type="text"
              placeholder="e.g. Aptitude_2026_2021_V1 (blank = repo root)"
              value={form.rootPath}
              onChange={update('rootPath')}
            />
          </label>
          <label>
            Solutions root path
            <input
              type="text"
              placeholder="(blank = solutions repo root)"
              value={form.solutionRootPath}
              onChange={update('solutionRootPath')}
            />
          </label>
          <label>
            Branch/ref override
            <input type="text" placeholder="(blank = default / URL branch)" value={form.branchName} onChange={update('branchName')} />
          </label>
        </div>
        <label>
          Book ID override
          <input type="text" placeholder="(blank = derived from repo name)" value={form.bookId} onChange={update('bookId')} />
        </label>
      </details>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Syncing…' : 'Register & Sync'}
      </button>
    </form>
  );
}
