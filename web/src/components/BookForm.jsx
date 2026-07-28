import { useState } from 'react';

const SUBJECTS = [
  { value: 'aptitude', label: 'Aptitude' },
  { value: 'maths', label: 'Maths' },
  { value: 'technical', label: 'Technical' }
];

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
            {SUBJECTS.map((s) => (
              <option key={s.value} value={s.value}>
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

      {form.subject === 'technical' && (
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
