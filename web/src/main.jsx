import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import SignInGate from './components/SignInGate.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      {/* Nothing in this portal is public, so the gate wraps the whole app
          rather than individual routes. */}
      <SignInGate>
        <App />
      </SignInGate>
    </AuthProvider>
  </React.StrictMode>
);
