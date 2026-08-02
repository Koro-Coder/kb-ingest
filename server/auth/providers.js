// One entry per OAuth provider. Adding a second provider is a config entry
// plus a claims mapping — the routes, tokens and stores are provider-agnostic.

const { AuthError } = require('./errors');

const GOOGLE = {
  id: 'google',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid email profile',
  // Google has historically issued both forms in the `iss` claim.
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
  profileFromClaims(claims) {
    return {
      providerUserId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: claims.name || claims.email,
      avatarUrl: claims.picture || null
    };
  }
};

const DEFAULTS = { google: GOOGLE };

// Merges the built-in definition with whatever the environment supplies
// (client id/secret always; endpoint overrides in tests).
function resolveProviders(configured = {}) {
  const resolved = {};
  for (const [id, overrides] of Object.entries(configured)) {
    const base = DEFAULTS[id];
    if (!base) {
      throw new Error(`Unknown OAuth provider configured: ${id}`);
    }
    resolved[id] = { ...base, ...overrides, id };
  }
  return resolved;
}

// The id_token comes straight back from the token endpoint over a direct TLS
// call we initiated, so its signature does not need re-verifying (OIDC
// §3.1.3.7). The claims still do: they are what decide who the user is.
function decodeIdToken(idToken) {
  if (typeof idToken !== 'string') {
    throw new AuthError('invalid_id_token', 'Provider returned no id_token');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new AuthError('invalid_id_token', 'id_token is malformed');
  }
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (error) {
    throw new AuthError('invalid_id_token', 'id_token payload is not readable');
  }
}

function validateIdTokenClaims(claims, provider, nowMs) {
  const issuers = provider.issuers || [provider.issuer];
  if (!issuers.includes(claims.iss)) {
    throw new AuthError('invalid_id_token', `Unexpected issuer: ${claims.iss}`);
  }
  // Without this, an id_token minted for any other Google client would be
  // accepted here — the classic OAuth audience-confusion hole.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(provider.clientId)) {
    throw new AuthError('invalid_id_token', 'id_token was not issued for this client');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) {
    throw new AuthError('invalid_id_token', 'id_token has expired');
  }
  if (!claims.sub) {
    throw new AuthError('invalid_id_token', 'id_token has no subject');
  }
  return claims;
}

module.exports = { resolveProviders, decodeIdToken, validateIdTokenClaims, DEFAULTS };
