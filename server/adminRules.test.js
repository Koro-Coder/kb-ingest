const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGrant, validateRoleChange, validateRemoval, normaliseEmail } = require('./adminRules');

// ---------------------------------------------------------------------------
// Granting access
// ---------------------------------------------------------------------------

test('a grant normalises the email, so one person cannot become two admins', () => {
  assert.equal(validateGrant({ email: '  Abhi@Example.COM ', role: 'admin' }).email, 'abhi@example.com');
});

test('a grant requires a plausible email address', () => {
  for (const email of ['', '   ', 'not-an-email', 'missing@domain', '@example.com', 'a b@c.com']) {
    const result = validateGrant({ email, role: 'admin' });
    assert.equal(result.status, 400, `expected rejection for ${JSON.stringify(email)}`);
  }
});

test('a grant only accepts the two real roles', () => {
  for (const role of [undefined, '', 'superuser', 'Owner', 'user', 'ADMIN']) {
    assert.equal(validateGrant({ email: 'a@b.com', role }).status, 400, `expected rejection for ${role}`);
  }
  assert.equal(validateGrant({ email: 'a@b.com', role: 'owner' }).role, 'owner');
  assert.equal(validateGrant({ email: 'a@b.com', role: 'admin' }).role, 'admin');
});

// ---------------------------------------------------------------------------
// Changing a role
// ---------------------------------------------------------------------------

test('promoting an admin to owner is allowed', () => {
  const result = validateRoleChange({
    existing: { email: 'a@b.com', role: 'admin' },
    newRole: 'owner',
    ownerCount: 1
  });
  assert.equal(result.ok, true);
});

test('demoting an owner is allowed while another owner remains', () => {
  const result = validateRoleChange({
    existing: { email: 'a@b.com', role: 'owner' },
    newRole: 'admin',
    ownerCount: 2
  });
  assert.equal(result.ok, true);
});

// The portal would keep working, but nobody could ever change its access list
// again — an unrecoverable state short of editing the database by hand.
test('demoting the LAST owner is refused', () => {
  const result = validateRoleChange({
    existing: { email: 'a@b.com', role: 'owner' },
    newRole: 'admin',
    ownerCount: 1
  });
  assert.equal(result.status, 409);
  assert.match(result.error, /last owner/i);
});

test('setting the role someone already has is a no-op, not an error', () => {
  const result = validateRoleChange({
    existing: { email: 'a@b.com', role: 'owner' },
    newRole: 'owner',
    ownerCount: 1
  });
  assert.equal(result.noop, true);
});

test('changing the role of someone who is not an admin is a 404', () => {
  assert.equal(validateRoleChange({ existing: null, newRole: 'admin', ownerCount: 2 }).status, 404);
});

test('an unknown role is refused even for an existing admin', () => {
  const result = validateRoleChange({
    existing: { email: 'a@b.com', role: 'admin' },
    newRole: 'root',
    ownerCount: 2
  });
  assert.equal(result.status, 400);
});

// ---------------------------------------------------------------------------
// Removing an admin
// ---------------------------------------------------------------------------

test('removing an admin is allowed', () => {
  const result = validateRemoval({
    existing: { email: 'a@b.com', role: 'admin' },
    actorEmail: 'owner@b.com',
    ownerCount: 1
  });
  assert.equal(result.ok, true);
});

test('removing the LAST owner is refused', () => {
  const result = validateRemoval({
    existing: { email: 'owner@b.com', role: 'owner' },
    actorEmail: 'owner@b.com',
    ownerCount: 1
  });
  assert.equal(result.status, 409);
  assert.match(result.error, /last owner/i);
});

test('an owner can remove another owner while two remain', () => {
  const result = validateRemoval({
    existing: { email: 'other@b.com', role: 'owner' },
    actorEmail: 'owner@b.com',
    ownerCount: 2
  });
  assert.equal(result.ok, true);
});

test('removing yourself is flagged, so the client can warn before you lose access', () => {
  const result = validateRemoval({
    existing: { email: 'owner@b.com', role: 'owner' },
    actorEmail: 'OWNER@B.COM',
    ownerCount: 2
  });
  assert.equal(result.ok, true);
  assert.equal(result.selfRemoval, true, 'case differences must not hide a self-removal');
});

test('removing someone who is not an admin is a 404', () => {
  assert.equal(validateRemoval({ existing: null, actorEmail: 'a@b.com', ownerCount: 2 }).status, 404);
});

test('email normalisation is consistent everywhere', () => {
  assert.equal(normaliseEmail('  A@B.COM '), 'a@b.com');
  assert.equal(normaliseEmail(null), '');
  assert.equal(normaliseEmail(undefined), '');
});
