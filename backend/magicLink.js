/**
 * Magic-link sign-in for non-@emamigroup.com emails.
 *
 * Direct email login (hub-auth.js's /hub-auth/db-login) only ever checked whether an email was
 * present in Manage Access (emami_apps.authorized_users) — nothing verified that whoever typed
 * the email actually owns that inbox. Fine for @emamigroup.com, which goes through Microsoft SSO
 * instead and never touches db-login at all; not fine for external accounts, where db-login was
 * the entire login path. This adds a real ownership check on top of the same Manage Access gate,
 * without changing db-login itself or anything about the SSO path.
 *
 * Stateless by design: the link itself IS the proof, a short-lived JWT signed with the same
 * HUB_AUTH_JWT_SECRET every other session token uses, carrying a "magic-link" purpose claim so it
 * can't be replayed as a real session token even if intercepted. No server-side storage needed —
 * important on this Lambda specifically, since (unlike an in-memory Map, fine for the SAML
 * CSRF-guard's near-instant redirect round trip in saml-sso.js) a magic link is clicked minutes
 * later, quite possibly by a different Lambda instance than the one that issued it.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { isAuthorized } = require('./authorizedUsers');
const { JWT_SECRET, FRONTEND_REDIRECT_URL, issueSessionToken } = require('./sessionAuth');
const { upsertLoginProfile } = require('./userProfile');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAGIC_LINK_TTL = '15m';
const MAGIC_LINK_PURPOSE = 'magic-link';

// TODO(Resend): set these in the Lambda's environment (see backend/.env.example) once the
// account/sender domain are ready. RESEND_FROM_EMAIL must be an address on a domain verified in
// the Resend dashboard, or every send fails.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';

function buildMagicLinkEmailHtml(link) {
    return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:13px;letter-spacing:0.6px;text-transform:uppercase;color:#6B7280;margin:0 0 8px;">Emami Apps</p>
      <h1 style="font-size:20px;color:#1F1B33;margin:0 0 16px;">Sign in to Emami Apps</h1>
      <p style="font-size:14px;color:#1F1B33;line-height:1.5;margin:0 0 24px;">
        Click the button below to finish signing in. This link expires in 15 minutes and can only be used once.
      </p>
      <a href="${link}" style="display:inline-block;background:#4F3FD6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Sign in to Emami Apps</a>
      <p style="font-size:12px;color:#6B7280;line-height:1.5;margin:24px 0 0;">
        If you didn't request this, you can safely ignore this email — no one can sign in without clicking this exact link.
      </p>
    </div>`;
}

/** Isolated on purpose — the only function that actually talks to Resend, so wiring up the real
 * account later is a one-file change. Throws on failure; callers decide how to surface that. */
async function sendMagicLinkEmail(email, link) {
    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
        throw new Error('Magic-link email is not configured yet. Please contact IT.');
    }
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: RESEND_FROM_EMAIL,
            to: [email],
            subject: 'Sign in to Emami Apps',
            html: buildMagicLinkEmailHtml(link),
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend API error (${res.status}): ${body.slice(0, 200)}`);
    }
}

const router = express.Router();

/** Step 1 — email a sign-in link, only for an email already present and active in Manage
 * Access. Same authorization rule db-login already enforces; this just adds the email-ownership
 * proof db-login never had. */
router.post('/hub-auth/magic-link/request', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    if (!JWT_SECRET) {
        return res.status(503).json({ success: false, error: 'Sign-in is not configured yet. Please contact IT.' });
    }
    try {
        if (!(await isAuthorized(email))) {
            return res.status(403).json({ success: false, error: 'This email-id is not registered. Contact your admin for access.' });
        }
        const token = jwt.sign({ email, purpose: MAGIC_LINK_PURPOSE }, JWT_SECRET, { expiresIn: MAGIC_LINK_TTL });
        const link = `${FRONTEND_REDIRECT_URL}/?magicToken=${encodeURIComponent(token)}`;
        await sendMagicLinkEmail(email, link);
        return res.json({ success: true });
    } catch (err) {
        console.error('[magic-link] request failed:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Could not send sign-in link. Please try again.' });
    }
});

/** Step 2 — the link itself lands here (RootNavigator.tsx picks up ?magicToken= the same way it
 * already does ?ssoToken=). Re-checks Manage Access at verify time too, not just at request
 * time — access could have been revoked in the few minutes the link was sitting in an inbox. */
router.post('/hub-auth/magic-link/verify', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token || !JWT_SECRET) {
        return res.status(400).json({ success: false, error: 'Invalid or expired link.' });
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload?.purpose !== MAGIC_LINK_PURPOSE || !payload?.email) {
            return res.status(401).json({ success: false, error: 'Invalid or expired link.' });
        }
        const email = String(payload.email).trim().toLowerCase();
        if (!(await isAuthorized(email))) {
            return res.status(403).json({ success: false, error: 'This email-id is not registered. Contact your admin for access.' });
        }
        await upsertLoginProfile(email, null);
        const sessionToken = issueSessionToken(email);
        return res.json({ success: true, email, token: sessionToken });
    } catch (err) {
        console.error('[magic-link] verify failed:', err.message);
        return res.status(401).json({ success: false, error: 'Invalid or expired link. Please request a new one.' });
    }
});

module.exports = router;
