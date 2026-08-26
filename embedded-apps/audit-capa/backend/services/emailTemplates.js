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
        <strong>${userId || "user"}</strong>.
      </p>

      <p>
        <strong>Audit No:</strong> ${auditNo || "-"}<br/>
        <strong>Finding No:</strong> ${findingNo || "-"}<br/>
        <strong>CAPA ID:</strong> ${capaNo || "-"}<br/>
        <strong>Total CAPA:</strong> ${totalCAPA || 0}<br/>
        <strong>Number of CAPAs Submitted:</strong> ${submittedCAPA || 0}<br/>
        <strong>Number of CAPAs Open:</strong> ${openCAPA || 0}
      </p>

      ${link
                ? `<p>
              <a href="${link}">
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
        <strong>Audit No:</strong> ${auditNo || "-"}<br/>
        <strong>Finding No:</strong> ${findingNo || "-"}<br/>
        <strong>CAPA ID:</strong> ${capaNo || "-"}<br/>
        <strong>Total CAPA:</strong> ${totalCAPA || 0}<br/>
        <strong>Number of CAPAs Submitted:</strong> ${submittedCAPA || 0}<br/>
        <strong>Number of CAPAs Open:</strong> ${openCAPA || 0}
      </p>

      ${link
                ? `<p>
              <a href="${link}">
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
        <strong>Audit No:</strong> ${auditNo || "-"}<br/>
        <strong>Finding No:</strong> ${findingNo || "-"}<br/>
        <strong>CAPA ID:</strong> ${capaNo || "-"}<br/>
        <strong>Total CAPA:</strong> ${totalCAPA || 0}<br/>
        <strong>Number of CAPAs Submitted:</strong> ${submittedCAPA || 0}<br/>
        <strong>Number of CAPAs Open:</strong> ${openCAPA || 0}
      </p>

      ${link
                ? `<p>
              <a href="${link}">
                Click here to resubmit CAPA
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
};