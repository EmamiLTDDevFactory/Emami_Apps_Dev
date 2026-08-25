/**
 * EmamiApps hub login — Microsoft Entra ID via SAML 2.0.
 *
 * This application is the SAML Service Provider (SP); Microsoft Entra ID is the Identity
 * Provider (IdP). Rather than hardcoding the IdP's SSO URL / certificate / entity ID in code —
 * which breaks silently the moment Azure rotates its signing certificate — an admin uploads the
 * IdP's Federation Metadata XML (downloaded from the Entra Enterprise Application) via the
 * "Configure SSO" screen, see the /sso/config routes below. It's parsed once, stored in
 * emami_apps.sso_config, and every login reads from there; re-uploading after a cert rotation is
 * a one-step fix instead of a redeploy.
 *
 * One thing still has to be configured by hand, once, on the Azure side: the Enterprise
 * Application's Identifier (Entity ID) and Reply URL (ACS URL) must exactly match SP_ENTITY_ID
 * and the ACS URL below — GET /api/sso/config returns both so an admin can copy-paste them into
 * Azure without reading this file.
 *
 * Replaces the OAuth2/OIDC Microsoft login this codebase used before (see git history) — that
 * approach hardcoded one Entra app registration's client ID/secret and kept getting blocked on
 * the redirect URI never being finished on the Azure side. Metadata-XML-driven SAML moves that
 * one-time setup to a self-service upload instead of a code change.
 */
const express = require('express');
const crypto = require('crypto');
const samlify = require('samlify');
const { pool } = require('./db');
const { isAuthorized } = require('./authorizedUsers');
const { FRONTEND_REDIRECT_URL, issueSessionToken } = require('./sessionAuth');

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

function buildServiceProvider(acsUrl) {
    return samlify.ServiceProvider({
        entityID: SP_ENTITY_ID,
        assertionConsumerService: [{ Binding: namespace.binding.post, Location: acsUrl }],
        wantAssertionsSigned: true,
    });
}

function buildIdentityProvider(metadataXml) {
    return samlify.IdentityProvider({ metadata: metadataXml });
}

async function loadIdpConfig() {
    const { rows } = await pool.query(
        'SELECT idp_metadata_xml, is_enabled FROM emami_apps.sso_config WHERE id = 1'
    );
    return rows[0] || null;
}

// CSRF/replay guard for the SAML redirect — mirrors the `state` map the old OAuth2 flow used.
// Single-instance in-memory store: a cold start (or a scaled-out Lambda routing /login and /acs
// to different instances) just means that one in-flight login attempt has to restart — same
// accepted limitation as before, not a new regression.
const pendingRequests = new Map();
const REQUEST_TTL_MS = 10 * 60 * 1000;
function trackRequest(id) {
    pendingRequests.set(id, Date.now() + REQUEST_TTL_MS);
}
function consumeRequest(id) {
    const expiry = pendingRequests.get(id);
    pendingRequests.delete(id);
    return !!expiry && Date.now() < expiry;
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

const router = express.Router();

/** Step 1 — redirect the browser to Microsoft to sign in. */
router.get('/hub-auth/saml/login', async (req, res) => {
    try {
        const idpRow = await loadIdpConfig();
        if (!idpRow || !idpRow.is_enabled || !idpRow.idp_metadata_xml) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_configured`);
        }
        const sp = buildServiceProvider(getAcsUrl(req));
        const idp = buildIdentityProvider(idpRow.idp_metadata_xml);
        const { id, context } = sp.createLoginRequest(idp, wording.binding.redirect);
        trackRequest(id);
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
        const idpRow = await loadIdpConfig();
        if (!idpRow || !idpRow.is_enabled || !idpRow.idp_metadata_xml) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=not_configured`);
        }
        const sp = buildServiceProvider(getAcsUrl(req));
        const idp = buildIdentityProvider(idpRow.idp_metadata_xml);
        const { extract } = await sp.parseLoginResponse(idp, wording.binding.post, req);

        const inResponseTo = extract?.response?.inResponseTo;
        if (!inResponseTo || !consumeRequest(inResponseTo)) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=invalid_response`);
        }

        const email = extractEmail(extract);
        if (!email || !(await isAuthorized(email))) {
            return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=domain_not_allowed`);
        }

        const sessionToken = issueSessionToken(email);
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoToken=${encodeURIComponent(sessionToken)}`);
    } catch (err) {
        console.error('[saml-sso] ACS callback failed:', err.message);
        return res.redirect(`${FRONTEND_REDIRECT_URL}/?ssoError=invalid_response`);
    }
});

/* =========================== Admin config ("Configure SSO" screen) =========================== */

/** SHA-256 fingerprint + expiry of the stored signing certificate, for display only — the actual
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

/** Everything an admin needs to finish wiring up the Azure side, plus the current IdP config (if
 * any has been uploaded) so the screen renders its status without a second round trip. */
router.get('/sso/config', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT idp_entity_id, sso_url, certificate, is_enabled, uploaded_by, uploaded_at FROM emami_apps.sso_config WHERE id = 1'
        );
        const row = rows[0] || null;
        const cert = row?.certificate ? certDetails(row.certificate) : null;
        res.json({
            success: true,
            sp: { entityId: SP_ENTITY_ID, acsUrl: getAcsUrl(req) },
            idp: row
                ? {
                    configured: true,
                    entityId: row.idp_entity_id,
                    ssoUrl: row.sso_url,
                    isEnabled: row.is_enabled,
                    uploadedBy: row.uploaded_by,
                    uploadedAt: row.uploaded_at,
                    certificateFingerprint: cert?.fingerprint || null,
                    certificateExpiresAt: cert?.validTo || null,
                }
                : { configured: false, isEnabled: false },
        });
    } catch (err) {
        console.error('[saml-sso] Failed to load SSO config:', err.message);
        res.status(500).json({ success: false, error: 'Could not load SSO configuration.' });
    }
});

/** Admin uploads the IdP's Federation Metadata XML — parsed here (entity ID, SSO URL, signing
 * certificate) so the raw XML never has to be hand-transcribed into env vars or code. */
router.post('/sso/config/metadata', express.json({ limit: '2mb' }), async (req, res) => {
    const xml = String(req.body?.xml || '').trim();
    const uploadedBy = String(req.body?.uploadedBy || '').trim().toLowerCase() || null;
    if (!xml) {
        return res.status(400).json({ success: false, error: 'No metadata XML was provided.' });
    }

    let idp;
    try {
        idp = buildIdentityProvider(xml);
    } catch {
        return res.status(400).json({ success: false, error: 'Could not parse this file as SAML metadata XML.' });
    }

    try {
        const entityId = idp.entityMeta.getEntityID();
        const ssoUrl = idp.entityMeta.getSingleSignOnService(wording.binding.redirect)
            || idp.entityMeta.getSingleSignOnService(wording.binding.post);
        let certificate = idp.entityMeta.getX509Certificate(wording.certUse.signing);
        if (Array.isArray(certificate)) certificate = certificate[0];
        const resolvedSsoUrl = Array.isArray(ssoUrl) ? ssoUrl[0] : ssoUrl;

        if (!entityId || !resolvedSsoUrl || !certificate) {
            return res.status(400).json({
                success: false,
                error: 'This metadata XML is missing an entity ID, SSO URL, or signing certificate.',
            });
        }

        await pool.query(
            `INSERT INTO emami_apps.sso_config (id, idp_metadata_xml, idp_entity_id, sso_url, certificate, uploaded_by, uploaded_at)
             VALUES (1, $1, $2, $3, $4, $5, now())
             ON CONFLICT (id) DO UPDATE SET
                idp_metadata_xml = EXCLUDED.idp_metadata_xml,
                idp_entity_id = EXCLUDED.idp_entity_id,
                sso_url = EXCLUDED.sso_url,
                certificate = EXCLUDED.certificate,
                uploaded_by = EXCLUDED.uploaded_by,
                uploaded_at = EXCLUDED.uploaded_at`,
            [xml, entityId, resolvedSsoUrl, certificate, uploadedBy]
        );

        const cert = certDetails(certificate);
        res.json({
            success: true,
            idp: {
                configured: true,
                entityId,
                ssoUrl: resolvedSsoUrl,
                certificateFingerprint: cert.fingerprint,
                certificateExpiresAt: cert.validTo,
            },
        });
    } catch (err) {
        console.error('[saml-sso] Failed to save IdP metadata:', err.message);
        res.status(500).json({ success: false, error: 'Could not save this configuration. Please try again.' });
    }
});

/** Flip Microsoft sign-in on/off without touching the stored metadata — lets an admin disable it
 * instantly (e.g. the certificate looks wrong) without losing the uploaded config. */
router.patch('/sso/config/enabled', express.json(), async (req, res) => {
    const isEnabled = !!req.body?.isEnabled;
    try {
        const { rowCount } = await pool.query(
            'UPDATE emami_apps.sso_config SET is_enabled = $1 WHERE id = 1',
            [isEnabled]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Upload IdP metadata before enabling Microsoft sign-in.' });
        }
        res.json({ success: true, isEnabled });
    } catch (err) {
        console.error('[saml-sso] Failed to update SSO enabled state:', err.message);
        res.status(500).json({ success: false, error: 'Could not update this setting.' });
    }
});

/** Remove the stored IdP config entirely — Microsoft sign-in goes back to "not configured" until
 * metadata is uploaded again. */
router.delete('/sso/config', async (req, res) => {
    try {
        await pool.query('DELETE FROM emami_apps.sso_config WHERE id = 1');
        res.json({ success: true });
    } catch (err) {
        console.error('[saml-sso] Failed to clear SSO config:', err.message);
        res.status(500).json({ success: false, error: 'Could not clear this configuration.' });
    }
});

module.exports = router;
