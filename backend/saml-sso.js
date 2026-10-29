/**
 * EmamiApps hub login — Microsoft Entra ID via SAML 2.0.
 *
 * This application is the SAML Service Provider (SP); Microsoft Entra ID is the Identity
 * Provider (IdP). The IdP's Federation Metadata XML (downloaded from the Entra Enterprise
 * Application) is committed as a static file — see ./idpConfig.js for why: a live "upload via
 * the app" admin screen would need a runtime-writable store Lambda can share across invocations
 * (DynamoDB, S3, or Postgres+VPC networking), which isn't worth it for a certificate that
 * rotates roughly every 3 years. Rotating it now means replacing that file and redeploying via
 * `npm run deploy:lambdas`, same as any other backend change. GET /api/sso/config below is
 * read-only — it just reports the currently-bundled config so an admin can verify it without
 * reading source.
 *
 * One thing still has to be configured by hand, once, on the Azure side: the Enterprise
 * Application's Identifier (Entity ID) and Reply URL (ACS URL) must exactly match SP_ENTITY_ID
 * and the ACS URL below — GET /api/sso/config returns both so an admin can copy-paste them into
 * Azure without reading this file.
 *
 * Replaces the OAuth2/OIDC Microsoft login this codebase used before (see git history) — that
 * approach hardcoded one Entra app registration's client ID/secret and kept getting blocked on
 * the redirect URI never being finished on the Azure side.
 */
const express = require('express');
const crypto = require('crypto');
const samlify = require('samlify');
const idpConfig = require('./idpConfig');
const { isAuthorized } = require('./authorizedUsers');
const { JWT_SECRET, FRONTEND_REDIRECT_URL, issueSessionToken } = require('./sessionAuth');
const { upsertLoginProfile } = require('./userProfile');

// Full XSD schema validation needs a native `xmllint` binary samlify doesn't ship — not viable in
// a Lambda zip. This only skips that structural check; signature validation (the part that
// actually matters for security) still runs on every login, unconditionally (see flow.js).
samlify.setSchemaValidator({ validate: () => Promise.resolve('SKIPPED') });

// `namespace.binding.*` holds the full SAML binding URNs (used in metadata/AssertionConsumer-
// Service); `wording.binding.*` holds the short keys ('redirect'/'post') samlify's own methods
// (createLoginRequest, parseLoginResponse, getSingleSignOnService) take as their `binding` arg.
const { namespace, wording } = samlify.Constants;

// Azure matches the Reply URL exactly, so — unlike the old OAuth2 redirect_uri, which was
// derived per-request from request headers — this needs a fixed value in production. Falls back
// to a request-derived guess only so local dev works without setting it.
const SP_ENTITY_ID = process.env.HUB_AUTH_SAML_SP_ENTITY_ID || 'https://www.emamiapps.in/saml/sp';

function getAcsUrl(req) {
    if (process.env.HUB_AUTH_SAML_ACS_URL) return process.env.HUB_AUTH_SAML_ACS_URL;
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}${req.baseUrl}/hub-auth/saml/acs`;
}

function getSloUrl(req) {
    if (process.env.HUB_AUTH_SAML_SLO_URL) return process.env.HUB_AUTH_SAML_SLO_URL;
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}${req.baseUrl}/hub-auth/saml/sls`;
}

function buildServiceProvider(acsUrl, sloUrl) {
    return samlify.ServiceProvider({
        entityID: SP_ENTITY_ID,
        assertionConsumerService: [{ Binding: namespace.binding.post, Location: acsUrl }],
        singleLogoutService: [{ Binding: namespace.binding.redirect, Location: sloUrl }],
        wantAssertionsSigned: true,
        generateID: generateRequestId,
    });
}

function buildIdentityProvider(metadataXml) {
    return samlify.IdentityProvider({ metadata: metadataXml });
}

// CSRF guard for the SAML redirect. Stateless on purpose: the AuthnRequest ID itself carries a
// timestamp and an HMAC, so ANY instance can validate the response. The earlier in-memory Map
// failed whenever /login and /acs landed on different Lambda instances (or after a cold start):
// the user authenticated with Microsoft, got "invalid_response" and had to sign in a second time.
const REQUEST_TTL_MS = 10 * 60 * 1000;
function requestSignature(nonce, issuedAt) {
    return crypto.createHmac('sha256', JWT_SECRET).update(`${nonce}.${issuedAt}`).digest('hex').slice(0, 32);
}
function generateRequestId() {
    const nonce = crypto.randomBytes(8).toString('hex');
    const issuedAt = Date.now().toString(16);
    // XML IDs must start with a letter or underscore, hence the leading '_'
    return `_${nonce}-${issuedAt}-${requestSignature(nonce, issuedAt)}`;
}
function consumeRequest(id) {
    const match = /^_([0-9a-f]{16})-([0-9a-f]+)-([0-9a-f]{32})$/.exec(String(id || ''));
    if (!match || !JWT_SECRET) return false;
    const [, nonce, issuedAtHex, sig] = match;
    const expected = requestSignature(nonce, issuedAtHex);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const age = Date.now() - parseInt(issuedAtHex, 16);
    return age >= -60 * 1000 && age < REQUEST_TTL_MS;
}

/** Claim URIs Azure AD's default SAML token configuration sends the user's email under —
 * checked in order after NameID itself, which is usually the email already. */
const EMAIL_ATTRIBUTE_KEYS = [
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    'email',
    'emailaddress',
    'mail',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
];

function extractEmail(extract) {
    const nameId = String(extract?.nameID || '').trim();
    if (nameId.includes('@')) return nameId.toLowerCase();
    const attrs = extract?.attributes || {};
    for (const key of EMAIL_ATTRIBUTE_KEYS) {
        const value = attrs[key];
        if (value && String(value).includes('@')) return String(value).trim().toLowerCase();
    }
    return '';
}

/** Claim URIs Azure AD's default SAML token configuration sends the user's display name under —
 * falls back to combining given name + surname, then to nothing (userProfile.js derives a display
 * name from the email itself when this comes back empty). */
const NAME_ATTRIBUTE_KEYS = [
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    'http://schemas.microsoft.com/identity/claims/displayname',
    'name',
    'displayname',
];
const GIVEN_NAME_KEY = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname';
const SURNAME_KEY = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname';

function extractName(extract) {
    const attrs = extract?.attributes || {};
    for (const key of NAME_ATTRIBUTE_KEYS) {
        const value = attrs[key];
        if (value) return String(value).trim();
    }
    const given = attrs[GIVEN_NAME_KEY];
    const surname = attrs[SURNAME_KEY];
    return [given, surname].filter(Boolean).join(' ').trim();
}

const router = express.Router();

/** Step 1 — redirect the browser to Microsoft to sign in. */
router.get('/hub-auth/saml/login', async (req, res) => {
    try {
        const idpRow = await idpConfig.getConfig();
        if (!idpRow || !idpRow.isEnabled || !idpRow.idpMetadataXml) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_configured`);
        }
        const sp = buildServiceProvider(getAcsUrl(req), getSloUrl(req));
        const idp = buildIdentityProvider(idpRow.idpMetadataXml);
        // No forceAuthn here (deliberately) — that would force Microsoft to re-prompt for
        // credentials on every single login, defeating SSO's whole point. Instead, app logout
        // below (/hub-auth/saml/logout) ends the Entra ID session too via SAML Single Logout, so a
        // *different* person signing in afterwards never inherits a leftover Microsoft session —
        // that's the actual scenario forceAuthn was originally added to close.
        const { context } = sp.createLoginRequest(idp, wording.binding.redirect);
        return res.redirect(context);
    } catch (err) {
        console.error('[saml-sso] login failed:', err.message);
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_configured`);
    }
});

/**
 * Step 2 — Microsoft POSTs the SAML Response here. samlify validates its signature against the
 * IdP's stored certificate (always, regardless of config — see flow.js's postFlow), then this
 * bounces the browser to the frontend with a session token (or an error code) in the query
 * string — the same shape the frontend already expects from the old OAuth2 flow.
 */
router.post('/hub-auth/saml/acs', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const idpRow = await idpConfig.getConfig();
        if (!idpRow || !idpRow.isEnabled || !idpRow.idpMetadataXml) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_configured`);
        }
        const sp = buildServiceProvider(getAcsUrl(req), getSloUrl(req));
        const idp = buildIdentityProvider(idpRow.idpMetadataXml);
        const { extract } = await sp.parseLoginResponse(idp, wording.binding.post, req);

        const inResponseTo = extract?.response?.inResponseTo;
        if (!inResponseTo || !consumeRequest(inResponseTo)) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=invalid_response`);
        }

        const email = extractEmail(extract);
        if (!email || !(await isAuthorized(email))) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_registered`);
        }

        await upsertLoginProfile(email, extractName(extract));

        const sessionToken = issueSessionToken(email);
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoToken=${encodeURIComponent(sessionToken)}`);
    } catch (err) {
        console.error('[saml-sso] ACS callback failed:', err.message);
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=invalid_response`);
    }
});

/**
 * Step 3 (SP-initiated Single Logout) — the app's own logout() (AuthContext.tsx) navigates here,
 * for a session that came in via Microsoft, right after clearing its own local session state.
 * This redirects on to Entra ID's Single Logout Service so the *browser's* Microsoft session ends
 * too — without this, forceAuthn was the only thing stopping a different person on the same
 * browser from silently inheriting the previous person's Microsoft session on their next sign-in
 * (see /hub-auth/saml/login's comment). Best-effort: any failure here just sends the browser back
 * to the frontend, since the app-side session is already gone by the time this is called either way.
 */
router.get('/hub-auth/saml/logout', async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    try {
        const idpRow = await idpConfig.getConfig();
        if (!idpRow || !idpRow.isEnabled || !idpRow.idpMetadataXml || !email) {
            return res.redirect(FRONTEND_REDIRECT_URL);
        }
        const sp = buildServiceProvider(getAcsUrl(req), getSloUrl(req));
        const idp = buildIdentityProvider(idpRow.idpMetadataXml);
        const { context } = sp.createLogoutRequest(idp, wording.binding.redirect, { logoutNameID: email });
        return res.redirect(context);
    } catch (err) {
        console.error('[saml-sso] SP-initiated logout failed:', err.message);
        return res.redirect(FRONTEND_REDIRECT_URL);
    }
});

/**
 * Step 4 — Entra ID redirects back here once it's finished processing the LogoutRequest above.
 * Nothing left to verify or clean up by this point (the app-side session was already cleared
 * before step 3 ever redirected away) — this only exists so the browser lands back on the
 * frontend instead of on Microsoft's own generic "signed out" page.
 */
router.get('/hub-auth/saml/sls', async (req, res) => {
    try {
        const idpRow = await idpConfig.getConfig();
        if (idpRow?.isEnabled && idpRow?.idpMetadataXml) {
            const sp = buildServiceProvider(getAcsUrl(req), getSloUrl(req));
            const idp = buildIdentityProvider(idpRow.idpMetadataXml);
            await sp.parseLogoutResponse(idp, wording.binding.redirect, req).catch((err) => {
                console.error('[saml-sso] SLS response parse failed (non-fatal):', err.message);
            });
        }
    } catch (err) {
        console.error('[saml-sso] SLS callback failed:', err.message);
    }
    return res.redirect(FRONTEND_REDIRECT_URL);
});

/* =============================== Read-only status ("Configure SSO" screen) =============================== */

/** SHA-256 fingerprint + expiry of the signing certificate, for display only — the actual
 * signature check always re-parses the full IdP metadata (see buildIdentityProvider above), so
 * this never gates login, only warns an admin before it silently breaks. */
function certDetails(certBase64) {
    try {
        const body = certBase64.replace(/\s+/g, '');
        const pem = `-----BEGIN CERTIFICATE-----\n${body.replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;
        const x509 = new crypto.X509Certificate(pem);
        return { fingerprint: x509.fingerprint256, validTo: x509.validTo };
    } catch {
        return { fingerprint: null, validTo: null };
    }
}

/** Last-resort regex fallback when samlify's structured extractor comes up empty — real-world
 * Federation Metadata XML (Azure's included) varies enough in namespace prefixes and element
 * ordering that the strict extractor occasionally misses a field a human (or a simple regex) can
 * still see plainly in the file. Runs a plain, non-negotiable-format read of the raw XML text. */
function regexFallback(xml, pattern) {
    const match = xml.match(pattern);
    return match ? match[1] : null;
}

/** Parses the bundled metadata XML into the fields the "Configure SSO" screen displays. Not used
 * by the login/ACS routes above — those hand the raw XML straight to samlify, which does its own
 * (authoritative) parsing and signature verification. This is display-only. */
function parseIdpFields(xml) {
    const idp = buildIdentityProvider(xml);

    const entityId = idp.entityMeta.getEntityID()
        || regexFallback(xml, /<(?:\w+:)?EntityDescriptor\b[^>]*\bentityID="([^"]+)"/);

    let ssoUrl = idp.entityMeta.getSingleSignOnService(wording.binding.redirect)
        || idp.entityMeta.getSingleSignOnService(wording.binding.post);
    if (Array.isArray(ssoUrl)) ssoUrl = ssoUrl[0];
    if (ssoUrl && typeof ssoUrl === 'object') ssoUrl = ssoUrl.Location || null;
    if (!ssoUrl) {
        ssoUrl = regexFallback(
            xml,
            /<(?:\w+:)?SingleSignOnService\b[^>]*\bBinding="urn:oasis:names:tc:SAML:2\.0:bindings:HTTP-(?:Redirect|POST)"[^>]*\bLocation="([^"]+)"/
        ) || regexFallback(xml, /<(?:\w+:)?SingleSignOnService\b[^>]*\bLocation="([^"]+)"/);
    }

    let certificate = idp.entityMeta.getX509Certificate(wording.certUse.signing);
    if (Array.isArray(certificate)) certificate = certificate[0];
    if (!certificate) {
        certificate = idp.entityMeta.getX509Certificate(wording.certUse.encrypt);
        if (Array.isArray(certificate)) certificate = certificate[0];
    }
    if (!certificate) {
        certificate = regexFallback(xml, /<(?:\w+:)?X509Certificate>\s*([\s\S]*?)\s*<\/(?:\w+:)?X509Certificate>/);
        if (certificate) certificate = certificate.replace(/\s+/g, '');
    }

    return { entityId, ssoUrl, certificate };
}

/** Everything an admin needs to finish wiring up the Azure side, plus the currently-bundled IdP
 * config (if any) so the "Configure SSO" screen renders status without reading source. Read-only
 * — see idpConfig.js for why this is no longer a live upload/enable/remove API. */
router.get('/sso/config', async (req, res) => {
    try {
        const row = await idpConfig.getConfig();
        let idpInfo = { configured: false, isEnabled: false };
        if (row) {
            const { entityId, ssoUrl, certificate } = parseIdpFields(row.idpMetadataXml);
            const cert = certificate ? certDetails(certificate) : null;
            idpInfo = {
                configured: true,
                isEnabled: row.isEnabled,
                entityId,
                ssoUrl,
                certificateFingerprint: cert?.fingerprint || null,
                certificateExpiresAt: cert?.validTo || null,
            };
        }
        res.json({
            success: true,
            sp: { entityId: SP_ENTITY_ID, acsUrl: getAcsUrl(req) },
            idp: idpInfo,
        });
    } catch (err) {
        console.error('[saml-sso] Failed to load SSO config:', err.message);
        res.status(500).json({ success: false, error: 'Could not load SSO configuration.' });
    }
});

module.exports = router;
