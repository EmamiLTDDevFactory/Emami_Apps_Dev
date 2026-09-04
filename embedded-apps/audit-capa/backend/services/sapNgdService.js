const https = require("https");
const { URL } = require("url");

// SAP OData Gateway (via the NGD proxy) for CAPA & Audit notification flags.
// See: OData Integration Guide for CAPA & Audit Notifications
// Service: ZQM_CAPA_AUDIT_SRV, Protocol: OData v2 (JSON), Method: POST
const NGD_BASE =
  "https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZQM_CAPA_AUDIT_SRV";

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
          });
        });
      }
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });

// SAP OData requires a CSRF handshake: fetch a token (+ session cookie) with
// a GET first, then replay both on the actual POST.
const sendSapFlag = async (entitySet, payload) => {
  const entityUrl = `${NGD_BASE}/${entitySet}`;

  try {
    const tokenResponse = await request("GET", entityUrl, {
      headers: {
        "X-CSRF-Token": "Fetch",
        Accept: "application/json",
      },
    });

    const csrfToken = tokenResponse.headers["x-csrf-token"] || "";
    const cookies = tokenResponse.headers["set-cookie"];

    const postResponse = await request("POST", entityUrl, {
      headers: {
        "X-CSRF-Token": csrfToken,
        Cookie: Array.isArray(cookies) ? cookies.join("; ") : cookies || "",
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: payload,
    });

    console.log(
      `SAP NGD ${entitySet} (Flag ${payload.Flag}) -> HTTP ${postResponse.statusCode}`
    );

    return postResponse.data;
  } catch (error) {
    // Never let a SAP/NGD outage break the action that triggered it.
    console.error(
      `SAP NGD ${entitySet} (Flag ${payload && payload.Flag}) failed:`,
      error.message
    );

    return null;
  }
};

module.exports = { sendSapFlag };
