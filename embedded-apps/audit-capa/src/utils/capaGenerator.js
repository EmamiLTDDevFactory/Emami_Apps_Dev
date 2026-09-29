import { buildFindingNo } from "./findingUtils";

export const generateCAPANumber = (
  findingNo
) => {
  const month = String(
    new Date().getMonth() + 1
  ).padStart(2, "0");

  const year = new Date()
    .getFullYear()
    .toString()
    .slice(-2);

  const finding = String(
    findingNo
  ).padStart(2, "0");

  const serial = String(
    findingNo
  ).padStart(4, "0");

  return `CAPA/F${finding}/${month}/${year}/${serial}`;
};

// One CAPA per non-compliant observation, in checklist order. Each gets a
// Finding No. (<Audit No>/F<nn>) unique across audits.
export const generateCAPA = (
  auditItems,
  auditNo
) => {
  return auditItems
    .filter(
      (item) =>
        // item.status ===
        // "Non Compliance"
        item.actualScore !== null &&
        item.status !== "NA" &&
        item.actualScore < 2
    )
    .map((item, index) => ({
      id: Date.now() + index,

      // capaNo:
      //   `CAPA-${index + 1}`,

      capaNo: generateCAPANumber(index + 1),

      findingNo: buildFindingNo(auditNo, index + 1),

      category: item.category,

      section: item.section,

      parameter: item.parameter,

      observationArea:
        item.category,

      observation:
        item.observation ||
        item.parameter,

      status: "Open",

      rootCause: "",

      preventiveAction: "",
      cqaRemarks: "",

      // targetDate: null,
      targetDate: item.targetDate || "",
      submittedDate: "",
      evidence: null,
      severity:
        item.severity,
    }));
};

// "Add CAPA": an extra CAPA on an existing finding (CQA). Same CAPA No. format;
// keeps the finding's F-number and takes the next serial in the audit, e.g. a
// second CAPA for F02 in an audit with 0001-0005 -> CAPA/F02/MM/YY/0006.
export const buildAdditionalCAPA = ({
  finding,
  auditCapas,
  auditId,
  findingNo,
  description,
  targetDate,
}) => {
  const serialOf = (capaNo) =>
    Number(/\/(\d+)$/.exec(capaNo || "")?.[1] || 0);

  const nextSerial =
    Math.max(0, ...auditCapas.map((capa) => serialOf(capa.capaNo))) + 1;

  const findingSerial =
    Number(/\/F(\d+)$/.exec(findingNo || "")?.[1]) ||
    Number(/^CAPA\/F(\d+)\//.exec(finding.capaNo || "")?.[1]) ||
    1;

  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const year = new Date().getFullYear().toString().slice(-2);

  return {
    auditId,
    capaNo: `CAPA/F${String(findingSerial).padStart(2, "0")}/${month}/${year}/${String(nextSerial).padStart(4, "0")}`,
    findingNo,
    category: finding.observationArea || finding.category,
    parameter: finding.parameter,
    observation: finding.observation,
    targetDate,
    description,
    isAdditional: true,
    status: "Open",
  };
};
