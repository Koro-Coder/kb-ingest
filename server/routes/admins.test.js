const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness } = require('../test-support/harness');

const OWNER = { email: 'owner@example.com', role: 'owner', addedAt: '2026-01-01T00:00:00.000Z' };
const ADMIN = { email: 'admin@example.com', role: 'admin', addedAt: '2026-01-01T00:00:00.000Z' };

async function asOwner(fn, admins = [OWNER, ADMIN]) {
  const harness = await startHarness({ admins });
  try {
    const { accessToken } = await harness.signIn({ email: OWNER.email });
    await fn({ ...harness, accessToken });
  } finally {
    await harness.close();
  }
}

test('an owner sees everyone, with the owner count and their own address', async () => {
  await asOwner(async ({ request, accessToken }) => {
    const res = await request('/api/admins', { accessToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.admins.length, 2);
    assert.equal(res.body.ownerCount, 1);
    assert.equal(res.body.you, OWNER.email);
  });
});

test('an owner can grant admin access to a new address', async () => {
  await asOwner(async ({ request, accessToken, stores }) => {
    const res = await request('/api/admins', {
      method: 'POST',
      json: { email: 'New.Person@Example.com', role: 'admin' },
      accessToken
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.email, 'new.person@example.com', 'stored lowercased');
    assert.equal(res.body.role, 'admin');
    assert.equal(res.body.addedBy, OWNER.email);
    assert.equal((await stores.admins.findByEmail('NEW.PERSON@EXAMPLE.COM')).role, 'admin');
  });
});

test('an owner can grant ownership', async () => {
  await asOwner(async ({ request, accessToken }) => {
    const res = await request('/api/admins', {
      method: 'POST',
      json: { email: 'co-owner@example.com', role: 'owner' },
      accessToken
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.role, 'owner');
  });
});

test('a malformed grant is refused', async () => {
  await asOwner(async ({ request, accessToken, stores }) => {
    const before = stores.admins._count();
    for (const json of [
      {},
      { email: 'not-an-email', role: 'admin' },
      { email: 'a@b.com' },
      { email: 'a@b.com', role: 'superuser' },
      { email: '   ', role: 'admin' }
    ]) {
      const res = await request('/api/admins', { method: 'POST', json, accessToken });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(json)}`);
    }
    assert.equal(stores.admins._count(), before, 'nothing should have been created');
  });
});

test('an owner can promote and demote', async () => {
  await asOwner(
    async ({ request, accessToken }) => {
      const promoted = await request(`/api/admins/${ADMIN.email}`, {
        method: 'PATCH',
        json: { role: 'owner' },
        accessToken
      });
      assert.equal(promoted.status, 200);
      assert.equal(promoted.body.role, 'owner');

      const demoted = await request(`/api/admins/${ADMIN.email}`, {
        method: 'PATCH',
        json: { role: 'admin' },
        accessToken
      });
      assert.equal(demoted.status, 200);
      assert.equal(demoted.body.role, 'admin');
    },
    [OWNER, ADMIN]
  );
});

test('an owner can remove an admin', async () => {
  await asOwner(async ({ request, accessToken, stores }) => {
    const res = await request(`/api/admins/${ADMIN.email}`, { method: 'DELETE', accessToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.removed, ADMIN.email);
    assert.equal(await stores.admins.findByEmail(ADMIN.email), null);
  });
});

test('removing or patching someone who is not an admin is a 404', async () => {
  await asOwner(async ({ request, accessToken }) => {
    assert.equal((await request('/api/admins/ghost@example.com', { method: 'DELETE', accessToken })).status, 404);
    assert.equal(
      (await request('/api/admins/ghost@example.com', { method: 'PATCH', json: { role: 'admin' }, accessToken }))
        .status,
      404
    );
  });
});

// The lockout guards. Without these the portal reaches a state where nobody
// can ever change its access list again.
test('the last owner cannot be removed', async () => {
  await asOwner(async ({ request, accessToken, stores }) => {
    const res = await request(`/api/admins/${OWNER.email}`, { method: 'DELETE', accessToken });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /last owner/i);
    assert.ok(await stores.admins.findByEmail(OWNER.email), 'the owner must still exist');
  });
});

test('the last owner cannot be demoted', async () => {
  await asOwner(async ({ request, accessToken, stores }) => {
    const res = await request(`/api/admins/${OWNER.email}`, {
      method: 'PATCH',
      json: { role: 'admin' },
      accessToken
    });
    assert.equal(res.status, 409);
    assert.equal((await stores.admins.findByEmail(OWNER.email)).role, 'owner');
  });
});

test('once a second owner exists, the first can step down', async () => {
  await asOwner(async ({ request, accessToken, stores }) => {
    await request('/api/admins', {
      method: 'POST',
      json: { email: 'co-owner@example.com', role: 'owner' },
      accessToken
    });

    const res = await request(`/api/admins/${OWNER.email}`, {
      method: 'PATCH',
      json: { role: 'admin' },
      accessToken
    });
    assert.equal(res.status, 200);
    assert.equal((await stores.admins.findByEmail(OWNER.email)).role, 'admin');
  });
});

test('self-removal is flagged so the UI can warn before it happens', async () => {
  await asOwner(async ({ request, accessToken }) => {
    await request('/api/admins', {
      method: 'POST',
      json: { email: 'co-owner@example.com', role: 'owner' },
      accessToken
    });

    const res = await request(`/api/admins/${OWNER.email}`, { method: 'DELETE', accessToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.selfRemoval, true);
  });
});

test('re-granting an existing admin keeps who first added them', async () => {
  await asOwner(async ({ request, accessToken }) => {
    const res = await request('/api/admins', {
      method: 'POST',
      json: { email: ADMIN.email, role: 'owner' },
      accessToken
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.role, 'owner', 'role is updated');
    assert.equal(res.body.addedAt, ADMIN.addedAt, 'original addedAt is preserved');
  });
});

test('setting the role someone already holds is a no-op rather than an error', async () => {
  await asOwner(async ({ request, accessToken }) => {
    const res = await request(`/api/admins/${ADMIN.email}`, {
      method: 'PATCH',
      json: { role: 'admin' },
      accessToken
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
  });
});
