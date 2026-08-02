// One error type for the whole auth layer. The `code` is what tests and the
// SPA branch on — in particular `token_expired`, which tells the client to
// call /api/auth/refresh rather than bounce the user to a login screen.

class AuthError extends Error {
  constructor(code, message, status = 401) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { AuthError };
