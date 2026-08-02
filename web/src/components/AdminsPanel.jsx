import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { listAdmins, grantAdmin, setAdminRole, removeAdmin } from '../api.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

// Owner-only. The server enforces every rule here independently — this UI just
// avoids offering actions that would be refused.
export default function AdminsPanel() {
  const { authFetch, user } = useAuth();
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await listAdmins());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = async (event) => {
    event.preventDefault();
    await run(async () => {
      await grantAdmin({ email, role });
      setEmail('');
      setRole('admin');
    });
  };

  const admins = (data && data.admins) || [];
  const ownerCount = (data && data.ownerCount) || 0;

  return (
    <section className="card">
      <div className="section-head">
        <h2>Administrators</h2>
        <span className="muted small">
          {admins.length} person{admins.length === 1 ? '' : 's'} · {ownerCount} owner
          {ownerCount === 1 ? '' : 's'}
        </span>
      </div>

      <p className="muted small">
        Anyone listed here can sign in with Google and use this portal. Owners can additionally manage
        this list. Access is by email address — you can add someone before they have ever signed in.
      </p>

      <form className="admin-add" onSubmit={add}>
        <input
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit" disabled={busy || !email.trim()}>
          Grant access
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="table-scroll">
        {/* Its own class, not .book-table: that one carries a 1040px floor and
            per-column widths tuned for repo names, which do not exist here. */}
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
              <th>Added by</th>
              <th>Last signed in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              // The last owner cannot be demoted or removed — the portal would
              // have nobody able to change its access list again.
              const isLastOwner = a.role === 'owner' && ownerCount <= 1;
              const isSelf = user && a.email === user.email;
              return (
                <tr key={a.email}>
                  <td>
                    {a.name ? `${a.name} ` : ''}
                    <span className="muted small">{a.email}</span>
                    {isSelf && <span className="tag"> you</span>}
                  </td>
                  <td>
                    <span className={`status-badge status-${a.role === 'owner' ? 'reviewing' : 'open'}`}>
                      {a.role}
                    </span>
                  </td>
                  <td className="small">{formatDate(a.addedAt)}</td>
                  <td className="small muted">{a.addedBy || '—'}</td>
                  <td className="small">{formatDate(a.lastLoginAt)}</td>
                  <td className="actions">
                    <button
                      className="ghost"
                      disabled={busy || isLastOwner}
                      title={isLastOwner ? 'Promote another owner first' : ''}
                      onClick={() =>
                        run(() => setAdminRole(a.email, a.role === 'owner' ? 'admin' : 'owner'))
                      }
                    >
                      {a.role === 'owner' ? 'Make admin' : 'Make owner'}
                    </button>
                    <button
                      className="danger"
                      disabled={busy || isLastOwner}
                      title={isLastOwner ? 'Promote another owner first' : ''}
                      onClick={() => {
                        const message = isSelf
                          ? 'Remove your own access? You will be signed out immediately.'
                          : `Remove ${a.email}? Their sessions end immediately.`;
                        if (window.confirm(message)) {
                          run(() => removeAdmin(a.email));
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
