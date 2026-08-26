export const generateAuditNumber = (
  auditType,
  depotCode
) => {
  const year = "26-27";

  const month =
    new Date()
      .toLocaleString("default", {
        month: "short",
      })
      .toUpperCase();

  const mode =
    auditType === "Desktop"
      ? "D"
      : "O";

  // const serial = "0001";

  const serial =
    Date.now()
      .toString()
      .slice(-4);

  return `AUD/${mode}/${depotCode}/${month}_${year}/${serial}`;
};