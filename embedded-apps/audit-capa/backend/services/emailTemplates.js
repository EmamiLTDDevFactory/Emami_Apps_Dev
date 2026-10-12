// Every interpolated value comes from a notification's stored email_payload, so it's escaped
// before going into the HTML — nothing in a payload can inject markup into the email.
const escapeHtml = (value) =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

// Same default the frontend uses for production (src/components/layout/emamiAppsUrl.js).
const DEFAULT_APP_URL = "https://www.emamiapps.in/";

// Links only ever point at Emami Apps itself (www/dev/any *emamiapps.in host) over https, or a
// local dev server. Anything else — other hosts, javascript:, relative paths — falls back to
// the default app URL rather than going out in the email.
const safeLink = (link) => {
    try {
        const url = new URL(String(link));
        const host = url.hostname.toLowerCase();
        const isLocal = host === "localhost" || host === "127.0.0.1";

        if (isLocal && (url.protocol === "http:" || url.protocol === "https:")) {
            return url.toString();
        }
        if (
            url.protocol === "https:" &&
            (host === "emamiapps.in" || host.endsWith(".emamiapps.in"))
        ) {
            return url.toString();
        }
    } catch (_) {
        // Not an absolute URL — fall through to the default.
    }
    return DEFAULT_APP_URL;
};

const capaSubmittedTemplate = ({
    auditNo,
    findingNo,
    capaNo,
    totalCAPA,
    submittedCAPA,
    openCAPA,
    userId,
    link,
}) => {

    return {
        subject: `CAPA Submitted - ${auditNo}`,

        html: `
      <p>Dear All,</p>

      <p>
        CAPA is updated with remarks from
        <strong>${escapeHtml(userId || "user")}</strong>.
      </p>

      <p>
        <strong>Audit No:</strong> ${escapeHtml(auditNo || "-")}<br/>
        <strong>Finding No:</strong> ${escapeHtml(findingNo || "-")}<br/>
        <strong>CAPA ID:</strong> ${escapeHtml(capaNo || "-")}<br/>
        <strong>Total CAPA:</strong> ${escapeHtml(totalCAPA || 0)}<br/>
        <strong>Number of CAPAs Submitted:</strong> ${escapeHtml(submittedCAPA || 0)}<br/>
        <strong>Number of CAPAs Open:</strong> ${escapeHtml(openCAPA || 0)}
      </p>

      ${link
                ? `<p>
              <a href="${escapeHtml(safeLink(link))}">
                Click here to view CAPA
              </a>
            </p>`
                : ""
            }

      <p>Regards,<br/>Audit CAPA System</p>
    `,
    };
};


const capaAcceptedTemplate = ({
    auditNo,
    findingNo,
    capaNo,
    totalCAPA,
    submittedCAPA,
    openCAPA,
    link,
}) => {

    return {
        subject: `CAPA Accepted & Closed - ${auditNo}`,

        html: `
      <p>Dear All,</p>

      <p>
        CAPA has been accepted and closed for:
      </p>

      <p>
        <strong>Audit No:</strong> ${escapeHtml(auditNo || "-")}<br/>
        <strong>Finding No:</strong> ${escapeHtml(findingNo || "-")}<br/>
        <strong>CAPA ID:</strong> ${escapeHtml(capaNo || "-")}<br/>
        <strong>Total CAPA:</strong> ${escapeHtml(totalCAPA || 0)}<br/>
        <strong>Number of CAPAs Submitted:</strong> ${escapeHtml(submittedCAPA || 0)}<br/>
        <strong>Number of CAPAs Open:</strong> ${escapeHtml(openCAPA || 0)}
      </p>

      ${link
                ? `<p>
              <a href="${escapeHtml(safeLink(link))}">
                Click here to view CAPA
              </a>
            </p>`
                : ""
            }

      <p>Regards,<br/>Audit CAPA System</p>
    `,
    };
};


const capaSentBackTemplate = ({
    auditNo,
    findingNo,
    capaNo,
    totalCAPA,
    submittedCAPA,
    openCAPA,
    link,
}) => {

    return {
        subject: `CAPA Sent Back - ${auditNo}`,

        html: `
      <p>Dear All,</p>

      <p>
        CAPA has been sent back to initiator for proper action.
      </p>

      <p>
        Please resubmit CAPA.
      </p>

      <p>
        <strong>Audit No:</strong> ${escapeHtml(auditNo || "-")}<br/>
        <strong>Finding No:</strong> ${escapeHtml(findingNo || "-")}<br/>
        <strong>CAPA ID:</strong> ${escapeHtml(capaNo || "-")}<br/>
        <strong>Total CAPA:</strong> ${escapeHtml(totalCAPA || 0)}<br/>
        <strong>Number of CAPAs Submitted:</strong> ${escapeHtml(submittedCAPA || 0)}<br/>
        <strong>Number of CAPAs Open:</strong> ${escapeHtml(openCAPA || 0)}
      </p>

      ${link
                ? `<p>
              <a href="${escapeHtml(safeLink(link))}">
                Click here to resubmit CAPA
              </a>
            </p>`
                : ""
            }

      <p>Regards,<br/>Audit CAPA System</p>
    `,
    };
};


// Generate CAPA / Add CAPA (CQA) -> Depot: CAPAs are waiting to be filled.
const capaAssignedTemplate = ({
    auditNo,
    findingNo,
    capaNo,
    totalCAPA,
    link,
}) => {

    return {
        subject: `CAPA Assigned - ${auditNo}`,

        html: `
      <p>Dear All,</p>

      <p>
        CAPA has been generated by CQA for the audit below. Please fill in the
        Root Cause, Corrective Action and evidence, and submit.
      </p>

      <p>
        <strong>Audit No:</strong> ${escapeHtml(auditNo || "-")}<br/>
        ${findingNo ? `<strong>Finding No:</strong> ${escapeHtml(findingNo)}<br/>` : ""}
        ${capaNo ? `<strong>CAPA ID:</strong> ${escapeHtml(capaNo)}<br/>` : ""}
        <strong>Number of CAPAs:</strong> ${escapeHtml(totalCAPA || 0)}
      </p>

      ${link
                ? `<p>
              <a href="${escapeHtml(safeLink(link))}">
                Click here to open the CAPA
              </a>
            </p>`
                : ""
            }

      <p>Regards,<br/>Audit CAPA System</p>
    `,
    };
};

module.exports = {
    capaSubmittedTemplate,
    capaAcceptedTemplate,
    capaSentBackTemplate,
    capaAssignedTemplate,
};