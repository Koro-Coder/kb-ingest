// PKCE (RFC 7636). Without it, an attacker who intercepts the authorization
// code — via a malicious app registered on the same redirect, or browser
// history — can exchange it themselves. The verifier proves the exchange comes
// from whoever started the flow.

const crypto = require('crypto');

// 64 random bytes as base64url is 86 characters, inside the 43-128 the spec
// allows, and base64url's alphabet is a subset of the permitted unreserved
// characters.
function createVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}

// S256 — the only method we offer. "plain" is allowed by the spec but gives
// away the verifier to anyone who can see the authorization request.
function challengeFor(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// CSRF defence for the callback: this value is echoed by the provider and
// compared against the copy bound to the caller's cookie.
function createState() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = { createVerifier, challengeFor, createState };
