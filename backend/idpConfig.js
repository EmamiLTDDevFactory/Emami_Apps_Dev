const fs = require('fs');
const path = require('path');

/**
 * Static, deploy-time Azure IdP metadata — replaces the earlier runtime-uploadable, DB/S3/
 * DynamoDB-backed config. This is a small internal tool whose Azure signing certificate rotates
 * roughly every 3 years (see the cert's own validity period), so a live "upload via the app"
 * admin screen wasn't worth the extra AWS resource (DynamoDB, or S3, or Postgres+VPC networking)
 * it would need just to give Lambda's normally read-only filesystem a runtime write target.
 *
 * Instead: commit the Federation Metadata XML to METADATA_PATH below (tracked in git — it's the
 * IdP's public signing certificate and endpoint URLs, no private key material). It ships inside
 * the same ZIP `npm run deploy:lambdas` already deploys — Lambda reads its own bundled code from
 * disk fine; no runtime write involved, no new AWS resource needed. Rotating the cert means
 * replacing this file and redeploying, same as any other backend code change.
 *
 * HUB_AUTH_SAML_ENABLED is a separate kill switch (an env var, not a file) — flip it off in the
 * Lambda's configuration to instantly disable Microsoft sign-in without touching the metadata or
 * redeploying code, e.g. if the certificate looks wrong.
 */
const METADATA_PATH = path.join(__dirname, 'azure-idp-metadata.xml');
const IS_ENABLED = process.env.HUB_AUTH_SAML_ENABLED === 'true';

let cached; // memoized for the life of the process (a cold start re-reads it once)
function loadStaticConfig() {
    if (cached !== undefined) return cached;
    if (!fs.existsSync(METADATA_PATH)) {
        cached = null;
        return cached;
    }
    cached = {
        idpMetadataXml: fs.readFileSync(METADATA_PATH, 'utf8'),
        isEnabled: IS_ENABLED,
    };
    return cached;
}

async function getConfig() {
    return loadStaticConfig();
}

module.exports = { getConfig };
