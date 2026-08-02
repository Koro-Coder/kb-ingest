// A stand-in for Google's OAuth endpoints, so the flow tests never touch the
// network. It implements just enough of the provider contract to exercise our
// side: a token endpoint that trades a code for an id_token, and knobs for
// forcing each failure mode we care about.

const http = require('http');
const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// The provider signs its id_token with its own key. Our callback trusts the
// token because it came back over a direct TLS call to the token endpoint
// (OIDC §3.1.3.7), so the tests only need a well-formed, decodable JWT — not
// a signature we verify.
function makeIdToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fake' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.${base64url('fake-signature')}`;
}

async function startFakeProvider(options = {}) {
  const state = {
    // Codes the provider will accept, mapped to the profile it returns.
    codes: new Map(),
    // Force the token endpoint to fail.
    tokenStatus: options.tokenStatus || 200,
    tokenBody: options.tokenBody || null,
    // Records what we were sent, so tests can assert on PKCE etc.
    lastTokenRequest: null,
    requestCount: 0
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);

    if (req.method === 'POST' && url.pathname === '/token') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        state.requestCount += 1;
        const params = new URLSearchParams(body);
        state.lastTokenRequest = Object.fromEntries(params.entries());

        if (state.tokenStatus !== 200) {
          res.writeHead(state.tokenStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(state.tokenBody || { error: 'server_error' }));
          return;
        }

        const code = params.get('code');
        const entry = state.codes.get(code);
        if (!entry) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'fake-provider-access-token',
            expires_in: 3599,
            token_type: 'Bearer',
            id_token: makeIdToken(entry)
          })
        );
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    authorizeUrl: `${origin}/authorize`,
    tokenUrl: `${origin}/token`,

    // Register a code the token endpoint will accept, returning the given
    // id_token claims. Defaults are a well-formed, verified Google profile.
    grant(code, claims = {}) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      state.codes.set(code, {
        iss: 'https://accounts.google.com',
        aud: claims.aud || 'test-client-id',
        sub: claims.sub || 'google-user-1',
        email: claims.email || 'student@example.com',
        email_verified: claims.email_verified !== undefined ? claims.email_verified : true,
        name: claims.name || 'Test Student',
        picture: claims.picture || 'https://example.com/avatar.png',
        iat: claims.iat || nowSeconds,
        exp: claims.exp || nowSeconds + 3600,
        ...claims
      });
      return code;
    },

    failTokenExchange(status = 500, body = { error: 'server_error' }) {
      state.tokenStatus = status;
      state.tokenBody = body;
    },

    get lastTokenRequest() {
      return state.lastTokenRequest;
    },
    get requestCount() {
      return state.requestCount;
    },

    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

module.exports = { startFakeProvider, makeIdToken };
