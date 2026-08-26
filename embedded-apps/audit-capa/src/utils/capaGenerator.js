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

  const serial = String(
    findingNo
  ).padStart(4, "0");

  return `CAPA/F${findingNo}/${month}/${year}/${serial}`;
};

export const generateCAPA = (
  auditItems
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

      capaNo:
        `CAPA-${index + 1}`,

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
