// Refresh-token rotation with reuse detection.
//
// Every refresh swaps the token for a new one and marks the old as replaced.
// If a replaced token is ever presented again, either the user replayed it or
// it was stolen — and we cannot tell which. So the entire family (the chain of
// tokens descending from one sign-in) is revoked and both parties have to sign
// in again. That turns a silent, indefinite session theft into one visible
// logout.

const crypto = require('crypto');
const { AuthError } = require('./errors');

const DAY_MS = 24 * 60 * 60 * 1000;

function createRefreshService({ store, tokens, refreshTtlDays, now = Date.now }) {
  async function issue(userId, familyId) {
    const { token, hash } = tokens.generateRefreshToken();
    const issuedAt = now();
    const record = {
      hash,
      userId,
      // A fresh sign-in starts its own family, so signing out on one device
      // cannot revoke another device's session.
      familyId: familyId || crypto.randomUUID(),
      createdAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + refreshTtlDays * DAY_MS).toISOString(),
      revokedAt: null,
      replacedByHash: null
    };
    await store.create(record);
    return { token, record };
  }

  async function rotate(token) {
    if (typeof token !== 'string' || !token) {
      throw new AuthError('invalid_token', 'No refresh token supplied');
    }
    const hash = tokens.hashRefreshToken(token);
    const record = await store.findByHash(hash);

    if (!record) {
      throw new AuthError('invalid_token', 'Refresh token is not recognised');
    }

    // Checked before `revokedAt`: a replayed token is a possible theft and
    // deserves the louder signal, even though the family revocation below
    // will also mark it revoked.
    if (record.replacedByHash) {
      await store.revokeFamily(record.familyId, new Date(now()).toISOString());
      throw new AuthError('token_reused', 'Refresh token was already used; session revoked');
    }

    if (record.revokedAt) {
      throw new AuthError('token_revoked', 'Refresh token has been revoked');
    }

    if (Date.parse(record.expiresAt) <= now()) {
      throw new AuthError('token_expired', 'Refresh token has expired');
    }

    const next = await issue(record.userId, record.familyId);
    await store.markReplaced(hash, next.record.hash, new Date(now()).toISOString());
    return next;
  }

  async function revoke(token) {
    if (typeof token !== 'string' || !token) {
      return;
    }
    await store.revoke(tokens.hashRefreshToken(token), new Date(now()).toISOString());
  }

  async function revokeFamily(familyId) {
    await store.revokeFamily(familyId, new Date(now()).toISOString());
  }

  // Every session this person has, on every device. Used when their admin
  // access is withdrawn: without it their existing refresh token stays usable
  // until it expires.
  async function revokeAllForUser(userId) {
    return store.revokeAllForUser(userId, new Date(now()).toISOString());
  }

  return { issue, rotate, revoke, revokeFamily, revokeAllForUser };
}

module.exports = { createRefreshService };
