const https = require("https");
const { URL } = require("url");

// SAP OData Gateway (via the NGD proxy) for CAPA & Audit notification flags.
// See: OData Integration Guide for CAPA & Audit Notifications
// Service: ZQM_CAPA_AUDIT_SRV, Protocol: OData v2 (JSON), Method: POST
//
// Overridable via SAP_NGD_BASE_URL so infra can move it without a code change.
const NGD_BASE =
  process.env.SAP_NGD_BASE_URL ||
  "https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZQM_CAPA_AUDIT_SRV";

// A hung proxy must never hold a request open indefinitely — Dispatch Tracker's /LoginSet
// call taught us that, where the same middleware hung until Azure returned a 504 minutes
// later. Fail fast and say so instead.
const REQUEST_TIMEOUT_MS = Number(process.env.SAP_NGD_TIMEOUT_MS || 30000);

const request = (method, url, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body ? JSON.stringify(body) : undefined;

    const req = https.request(
      target,
      {
        method,
        headers: {
          ...headers,
          ...(payload
            ? { "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let raw = "";

        res.on("data", (chunk) => {
          raw += chunk;
        });

        res.on("end", () => {
          let data = null;

          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (error) {
            data = raw;
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data,
            raw,
          });
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });

// Pulls SAP's own complaint out of an OData v2 error body, so the log records what SAP
// actually objected to rather than just a status code.
const sapErrorMessage = (data) => {
  if (!data) return "";
  if (typeof data === "string") return data.slice(0, 500);

  return (
    (data.error && data.error.message && data.error.message.value) ||
    (data.error && typeof data.error.message === "string" && data.error.message) ||
    ""
  );
};

/**
 * Posts one notification flag to SAP. SAP owns the actual email; this only delivers the
 * trigger (entitySet + Flag), per the integration guide.
 *
 * NO CSRF HANDSHAKE — deliberately. The Azure proxy performs that exchange with SAP on our
 * behalf. RC Portal, which POSTs through this same proxy successfully, makes its own
 * getCsrfToken() an explicit no-op for exactly this reason (see
 * embedded-apps/rc-portal/backend/server.js, "no-op for Azure AD OAuth proxy").
 *
 * The handshake this service previously performed fetched its token with a GET against the
 * entity set itself — and SAP answers those 501 Not Implemented, because CapaSet and
 * AuditTypesSet are create-only (verified against both proxy hostnames). So no token was
 * ever returned, the `|| ""` fallback left it empty, and every POST that followed was
 * rejected by SAP as a CSRF failure. That is what surfaced in the Azure logs as a token
 * problem; no credential had expired.
 *
 * Still non-fatal: a SAP or proxy outage must never break the user action that triggered the
 * notification. But the outcome is now returned and logged in full instead of being
 * swallowed into a null, so a failure is visible rather than silent.
 */
const sendSapFlag = async (entitySet, payload) => {
  const entityUrl = `${NGD_BASE}/${entitySet}`;
  const flag = payload && payload.Flag;

  try {
    const response = await request("POST", entityUrl, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: payload,
    });

    const ok = response.statusCode >= 200 && response.statusCode < 300;

    if (ok) {
      console.log(
        `SAP NGD ${entitySet} (Flag ${flag}) -> HTTP ${response.statusCode} OK`
      );
    } else {
      console.error(
        `SAP NGD ${entitySet} (Flag ${flag}) -> HTTP ${response.statusCode}` +
          `\n  url:      ${entityUrl}` +
          `\n  sent:     ${JSON.stringify(payload)}` +
          `\n  sap said: ${sapErrorMessage(response.data) || "(no message)"}` +
          `\n  body:     ${String(response.raw || "").slice(0, 1000)}`
      );
    }

    return {
      ok,
      statusCode: response.statusCode,
      data: response.data,
      error: ok
        ? null
        : sapErrorMessage(response.data) || `HTTP ${response.statusCode}`,
    };
  } catch (error) {
    console.error(
      `SAP NGD ${entitySet} (Flag ${flag}) could not reach SAP: ${error.message}` +
        `\n  url:  ${entityUrl}` +
        `\n  sent: ${JSON.stringify(payload)}`
    );

    return { ok: false, statusCode: 0, data: null, error: error.message };
  }
};

module.exports = { sendSapFlag };
