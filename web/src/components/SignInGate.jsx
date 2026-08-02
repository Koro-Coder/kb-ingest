import { useAuth } from '../auth.jsx';
import Brand from './Brand.jsx';

// The whole portal sits behind this. Nothing here is public, so there is no
// partial view for a signed-out visitor — just the door.
export default function SignInGate({ children }) {
  const { status, isSignedIn, signIn, deniedEmail } = useAuth();

  if (status === 'loading') {
    return (
      <div className="signin">
        <p className="muted">Checking your access…</p>
      </div>
    );
  }

  if (isSignedIn) {
    return children;
  }

  return (
    <div className="signin">
      <Brand large />
      <h1>Ingest console</h1>

      {deniedEmail !== null ? (
        <div className="signin-denied">
          <p>
            <strong>{deniedEmail || 'That account'}</strong> is not an administrator of this portal.
          </p>
          <p className="muted small">
            Signing in with Google proves who you are; it does not grant access here. Ask an owner to
            add your address, then try again.
          </p>
        </div>
      ) : (
        <p className="muted">This is a private admin portal. Sign in to continue.</p>
      )}

      <button className="btn-google" onClick={signIn}>
        <GoogleMark />
        Sign in with Google
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.3z"
      />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.6 10.8l7.8-6.1z" />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.5-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
