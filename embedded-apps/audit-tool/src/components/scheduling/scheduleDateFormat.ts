// Reproduces the exact string the source auditScheduling controller sends as StartDate/EndDate on
// update: sap.ui.core.format.DateFormat.getDateInstance({ pattern: "YYYY-MM-dd'T'HH:MM:SS" })
// .format(date). That pattern is not the ISO timestamp it looks like — in UI5 (CLDR) pattern
// letters:
//   YYYY -> week-based year (en: weeks start Sunday, week 1 contains Jan 1, so 27–31 Dec can roll
//           into the next year),
//   MM   -> month (in BOTH positions — the second "MM" is not minutes),
//   dd   -> day, HH -> hour 00–23,
//   SS   -> fractional seconds: milliseconds padded to 3 digits, first 2 kept.
// SAP already stores what that produced, so the same string is sent here rather than a "fixed" one.
function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function weekYear(d: Date): number {
  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  return weekEnd.getFullYear() > d.getFullYear() ? d.getFullYear() + 1 : d.getFullYear();
}

export function formatScheduleDate(d: Date): string {
  const month = pad(d.getMonth() + 1);
  const ms = pad(d.getMilliseconds(), 3).slice(0, 2);
  return `${weekYear(d)}-${month}-${pad(d.getDate())}T${pad(d.getHours())}:${month}:${ms}`;
}
