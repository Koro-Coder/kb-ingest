const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness } = require('../test-support/harness');

const OWNER = { email: 'owner@example.com', role: 'owner', addedAt: '2026-01-01T00:00:00.000Z' };
const ADMIN = { email: 'admin@example.com', role: 'admin', addedAt: '2026-01-01T00:00:00.000Z' };

async function withHarness(fn, overrides = {}) {
  const harness = await startHarness({ admins: [OWNER, ADMIN], ...overrides });
  try {
    await fn(harness);
  } finally {
    await harness.close();
  }
}

// ---------------------------------------------------------------------------
// Nothing is public
// ---------------------------------------------------------------------------

// This is the whole point of the change: before it, anyone who could reach the
// port could delete every book in the knowledge base.
test('every API route refuses an anonymous caller', async () => {
  await withHarness(async ({ request }) => {
    const calls = [
      ['GET', '/api/books'],
      ['POST', '/api/books'],
      ['DELETE', '/api/books/anything'],
      ['POST', '/api/books/anything/sync'],
      ['GET', '/api/reports/questions?type=question_issue'],
      ['GET', '/api/reports/summary'],
      ['DELETE', '/api/reports/question?type=question_issue&bookId=a&fileId=b&year=1&questionNum=1'],
      ['GET', '/api/admins']
    ];
    for (const [method, path] of calls) {
      const res = await request(path, { method, cookies: false });
      assert.equal(res.status, 401, `${method} ${path} should be 401`);
    }
  });
});

test('health stays public, so a monitor can reach it', async () => {
  await withHarness(async ({ request }) => {
    assert.equal((await request('/health', { cookies: false })).status, 200);
  });
});

test('a garbage or tampered token is refused', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    for (const token of ['nonsense', `${accessToken.slice(0, -3)}aaa`, '']) {
      const res = await request('/api/books', { cookies: false, accessToken: token || undefined });
      assert.equal(res.status, 401, `token ${JSON.stringify(token)} should be refused`);
    }
  });
});

// ---------------------------------------------------------------------------
// The allowlist is the authorisation decision
// ---------------------------------------------------------------------------

// Authenticating with Google proves who you are. It grants nothing here.
test('a real Google account that is not on the allowlist cannot get in', async () => {
  await withHarness(async ({ request, provider, config }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { email: 'stranger@example.com', sub: 'google-stranger' });

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);

    assert.equal(res.status, 302);
    const redirect = new URL(res.location);
    assert.equal(redirect.origin, new URL(config.appUrl).origin);
    assert.equal(redirect.searchParams.get('auth_error'), 'not_authorised');
    assert.equal(redirect.searchParams.get('signed_in'), null);
  });
});

test('a rejected sign-in leaves no session cookie behind', async () => {
  await withHarness(async ({ request, provider, jar }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { email: 'stranger@example.com' });
    await request(`/api/auth/google/callback?code=code-x&state=${state}`);

    assert.equal(jar.get('pf_admin_refresh'), null);
    assert.equal((await request('/api/auth/refresh', { method: 'POST' })).status, 401);
  });
});

// The knowledge-base routes read MongoDB, which this harness deliberately does
// not stub — so "allowed through" is proved by the absence of a 401/403, not
// by a 200. A 500 here means the gate opened and only the database was missing.
function assertPassedTheGate(res, label) {
  assert.ok(res.status !== 401 && res.status !== 403, `${label} should not be rejected (got ${res.status})`);
}

test('an allowlisted admin can sign in and reach the API', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { user, accessToken } = await signIn({ email: ADMIN.email });
    assert.equal(user.email, ADMIN.email);
    assert.equal(user.role, 'admin');
    assert.equal(user.isOwner, false);

    // A working session, proved without touching the database.
    const me = await request('/api/auth/me', { accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, ADMIN.email);

    assertPassedTheGate(await request('/api/books', { accessToken }), 'GET /api/books as admin');
  });
});

test('the email match is case-insensitive, as Google treats addresses', async () => {
  await withHarness(async ({ signIn }) => {
    const { user } = await signIn({ email: 'OWNER@Example.COM' });
    assert.ok(user, 'a differently-cased address must match the same admin');
    assert.equal(user.email, 'owner@example.com');
  });
});

test('an unverified email is refused even if allowlisted', async () => {
  await withHarness(async ({ request, provider }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { email: OWNER.email, email_verified: false });

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);
    assert.equal(res.status, 403);
  });
});

test('the admin session uses its own cookie, not the public site\'s', async () => {
  await withHarness(async ({ signIn, jar }) => {
    await signIn();
    assert.ok(jar.get('pf_admin_refresh'), 'expected the admin refresh cookie');
    assert.equal(jar.get('pf_refresh'), null, 'must not touch the public site cookie');
  });
});

// ---------------------------------------------------------------------------
// Owner vs admin
// ---------------------------------------------------------------------------

test('an owner sees the owner role and can reach the people page', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { user, accessToken } = await signIn({ email: OWNER.email });
    assert.equal(user.role, 'owner');
    assert.equal(user.isOwner, true);
    assert.equal((await request('/api/admins', { accessToken })).status, 200);
  });
});

test('an admin is refused the people page but keeps the rest of the portal', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn({ email: ADMIN.email });

    const denied = await request('/api/admins', { accessToken });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'owner_required');

    // Still an admin everywhere else.
    assert.equal((await request('/api/auth/me', { accessToken })).status, 200);
    assertPassedTheGate(await request('/api/books', { accessToken }), 'GET /api/books as admin');
  });
});

test('an admin cannot grant themselves ownership through any people route', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn({ email: ADMIN.email });

    const attempts = [
      ['POST', '/api/admins', { email: ADMIN.email, role: 'owner' }],
      ['PATCH', `/api/admins/${ADMIN.email}`, { role: 'owner' }],
      ['DELETE', `/api/admins/${OWNER.email}`, undefined]
    ];
    for (const [method, path, json] of attempts) {
      const res = await request(path, { method, json, accessToken });
      assert.equal(res.status, 403, `${method} ${path} should be 403`);
    }

    const admin = await stores.admins.findByEmail(ADMIN.email);
    assert.equal(admin.role, 'admin', 'role must be unchanged');
  });
});

// ---------------------------------------------------------------------------
// Revocation takes effect
// ---------------------------------------------------------------------------

test('removing an admin ends their session at the next refresh', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const admin = await signIn({ email: ADMIN.email });
    assert.equal(admin.refresh.status, 200);

    // The owner removes them, on their own session.
    const adminCookie = jar.get('pf_admin_refresh').value;
    jar.clear();
    const owner = await signIn({ code: 'code-owner', email: OWNER.email });
    const removed = await request(`/api/admins/${ADMIN.email}`, {
      method: 'DELETE',
      accessToken: owner.accessToken
    });
    assert.equal(removed.status, 200);
    assert.equal(await stores.admins.findByEmail(ADMIN.email), null);

    // Their refresh token no longer buys an access token.
    const after = await request('/api/auth/refresh', {
      method: 'POST',
      cookies: false,
      headers: { Cookie: `pf_admin_refresh=${adminCookie}` }
    });
    assert.equal(after.status, 401);
  });
});

test('me reports the current role, so a demotion is visible without re-login', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const second = { email: 'second@example.com', role: 'owner', addedAt: '2026-01-01T00:00:00.000Z' };
    await stores.admins.upsert({ ...second, at: second.addedAt });

    const target = await signIn({ email: second.email });
    assert.equal(target.user.role, 'owner');

    jar.clear();
    const owner = await signIn({ code: 'code-owner', email: OWNER.email });
    await request(`/api/admins/${second.email}`, {
      method: 'PATCH',
      json: { role: 'admin' },
      accessToken: owner.accessToken
    });

    const me = await request('/api/auth/me', { accessToken: target.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.role, 'admin', 'the demotion should be reflected immediately');
  });
});

test('logout ends the session', async () => {
  await withHarness(async ({ request, signIn }) => {
    await signIn();
    assert.equal((await request('/api/auth/logout', { method: 'POST' })).status, 204);
    assert.equal((await request('/api/auth/refresh', { method: 'POST' })).status, 401);
  });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

test('with an empty allowlist the bootstrap owner can be seeded, and only then', async () => {
  await withHarness(
    async ({ stores }) => {
      const at = new Date().toISOString();
      const seeded = await stores.admins.bootstrapOwner('first@example.com', at);
      assert.equal(seeded.role, 'owner');

      // Second call is a no-op: this is a bootstrap, not a standing backdoor.
      const again = await stores.admins.bootstrapOwner('someone-else@example.com', at);
      assert.equal(again, null);
      assert.equal(await stores.admins.findByEmail('someone-else@example.com'), null);
    },
    { admins: [] }
  );
});
