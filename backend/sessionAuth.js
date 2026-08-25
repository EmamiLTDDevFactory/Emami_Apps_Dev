const jwt = require('jsonwebtoken');

// Shared by every login path (direct email in hub-auth.js, Microsoft SAML in saml-sso.js) so a
// session token issued by one is verified the same way regardless of which path issued it.
const JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || '';
const FRONTEND_REDIRECT_URL = process.env.HUB_AUTH_FRONTEND_URL || 'https://www.emamiapps.in';

if (!JWT_SECRET) {
    console.warn('[hub-auth] HUB_AUTH_JWT_SECRET is not set — login will fail at the token-issuing step.');
}

function issueSessionToken(email) {
    return jwt.sign({ email }, JWT_SECRET, { expiresIn: '12h' });
}

module.exports = { JWT_SECRET, FRONTEND_REDIRECT_URL, issueSessionToken };
