import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useTheme } from '../theme.js';
import Brand from './Brand.jsx';

// One bar for everything: where you are, where else you can go, and who you
// are. The tabs used to sit in a strip of their own below a separate account
// row, which gave the page two competing headers above every screen.

function Icon({ path, size = 15 }) {
  return (
    <svg
      className="nav-ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const BOOK_ICON = (
  <>
    <path d="M12 21V7" />
    <path d="M3 5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H4a1 1 0 0 1-1-1Z" />
  </>
);

const CHART_ICON = (
  <>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M7 15l4-5 4 3 5-7" />
  </>
);

const PEOPLE_ICON = (
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </>
);

// The account menu is anchored by its right edge, not its left: it sits at the
// end of the bar, so a panel measured from the left would hang off the
// viewport on a narrow window.
function AccountMenu({ user, isOwner, signOut }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="acct" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        aria-label="Your account"
        title={user.email}
      >
        {/* Google does not always return a picture, and the avatar is the only
            way to reach Sign out — so it must always render something. */}
        {user.avatarUrl ? (
          <img className="avatar" src={user.avatarUrl} alt="" />
        ) : (
          <span className="avatar avatar-fallback" aria-hidden="true">
            {(user.name || user.email || '?').trim()[0].toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div className="acct-panel" role="menu" style={pos ? { top: pos.top, right: pos.right } : undefined}>
          <div className="acct-who">
            <strong>
              {user.name || user.email}{' '}
              <span className={`status-badge status-${isOwner ? 'reviewing' : 'open'}`}>{user.role}</span>
            </strong>
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="acct-item"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppHeader({ tab, onTab }) {
  const { user, isOwner, signOut } = useAuth();
  const { toggle } = useTheme();

  // Owner-only. The server refuses the underlying routes regardless, so hiding
  // the tab is convenience, not the control.
  const tabs = [
    { key: 'books', label: 'Books', icon: BOOK_ICON },
    { key: 'analytics', label: 'Analytics', icon: CHART_ICON },
    ...(isOwner ? [{ key: 'admins', label: 'Administrators', icon: PEOPLE_ICON }] : [])
  ];

  return (
    <header className="bar">
      <div className="bar-in">
        <Brand large />

        <nav className="nav" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? 'nav-current' : undefined}
              aria-current={tab === t.key ? 'page' : undefined}
              onClick={() => onTab(t.key)}
            >
              <Icon path={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="bar-actions">
          <button className="tt" type="button" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
            <svg
              className="i-moon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
            <svg
              className="i-sun"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          {user && <AccountMenu user={user} isOwner={isOwner} signOut={signOut} />}
        </div>
      </div>
    </header>
  );
}
