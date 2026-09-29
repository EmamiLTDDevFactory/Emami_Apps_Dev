// Finding No. — one per non-compliant observation, unique across audits:
//   <Audit No>/F<nn>   e.g. AUD/DO/26/09/0007/F01
// Several CAPAs may later share one Finding No. (one finding, many CAPAs).
export const buildFindingNo = (auditNo, serial) =>
    `${auditNo || "AUDIT"}/F${String(serial).padStart(2, "0")}`;

// CAPAs generated before Finding No. was assigned have finding_no = NULL.
// Their CAPA No. already carries the finding serial (CAPA/F01/09/26/0001), so
// the Finding No. is derived from it for display — nothing is written back.
export const getFindingNo = (capa, auditNo) => {
    if (capa?.findingNo) {
        return capa.findingNo;
    }

    const match = /^CAPA\/F(\d+)\//.exec(capa?.capaNo || "");

    return match && auditNo
        ? buildFindingNo(auditNo, Number(match[1]))
        : "";
};

// Links a checklist question to its CAPA (for showing the Finding No. on the
// question). Category + question text identify it; CAPAs don't store the id.
export const findingKey = (category, parameter) =>
    `${category || ""}::${(parameter || "").trim()}`;
