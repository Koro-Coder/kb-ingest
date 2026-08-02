// Boots the real Express app on an ephemeral port with in-memory stores and a
// fake OAuth provider. Testing through HTTP rather than by calling handlers
// directly means the mounted middleware order — which IS the access-control
// policy — is exercised for real.

const { createApp } = require('../app');
const { createStores } = require('./memoryStores');
const { startFakeProvider } = require('./fakeProvider');

const TEST_JWT_SECRET = 'admin-test-secret-not-used-anywhere-real';

function createCookieJar() {
  const cookies = new Map();
  return {
    store(setCookieHeaders) {
      for (const header of setCookieHeaders || []) {
        const [pair, ...attrParts] = header.split(';');
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const attrs = {};
        for (const part of attrParts) {
          const [k, v] = part.split('=');
          attrs[k.trim().toLowerCase()] = v === undefined ? true : v.trim();
        }
        if (value === '' || attrs['max-age'] === '0') {
          cookies.set(name, { name, value: '', attrs, deleted: true });
        } else {
          cookies.set(name, { name, value, attrs, deleted: false });
        }
      }
    },
    header() {
      return Array.from(cookies.values())
        .filter((c) => !c.deleted)
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    },
    get(name) {
      const c = cookies.get(name);
      return c && !c.deleted ? c : null;
    },
    clear() {
      cookies.clear();
    }
  };
}

async function startHarness(overrides = {}) {
  const provider = await startFakeProvider();
  const stores = overrides.stores || createStores(overrides.admins || []);

  const config = {
    jwtSecret: TEST_JWT_SECRET,
    issuer: 'prepfusion-admin-test',
    audience: 'prepfusion-ingest-test',
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    oauthStateTtlSeconds: 300,
    appUrl: 'http://localhost:5173',
    secureCookies: false,
    bootstrapOwner: null,
    providers: {
      google: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authorizeUrl: provider.authorizeUrl,
        tokenUrl: provider.tokenUrl,
        scope: 'openid email profile'
      }
    },
    ...overrides.config
  };

  const app = createApp({ stores, config, now: overrides.now });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const jar = createCookieJar();

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const cookieHeader = jar.header();
    if (cookieHeader && options.cookies !== false) {
      headers.Cookie = cookieHeader;
    }
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      redirect: 'manual'
    });

    jar.store(res.headers.getSetCookie());
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, headers: res.headers, location: res.headers.get('location'), body, text };
  }

  // Full authorization-code round trip, as a browser would do it.
  async function signIn({ code = 'test-code', email = 'owner@example.com', claims = {} } = {}) {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant(code, { email, sub: `google-${email}`, ...claims });
    const callback = await request(`/api/auth/google/callback?code=${code}&state=${state}`);
    const refreshed = await request('/api/auth/refresh', { method: 'POST' });
    return {
      start,
      callback,
      refresh: refreshed,
      accessToken: refreshed.body && refreshed.body.accessToken,
      user: refreshed.body && refreshed.body.user
    };
  }

  return {
    baseUrl,
    stores,
    config,
    provider,
    jar,
    request,
    signIn,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await provider.close();
    }
  };
}

module.exports = { startHarness, TEST_JWT_SECRET };
