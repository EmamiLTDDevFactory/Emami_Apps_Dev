// Small yyyy-mm-dd date helpers shared by the three period-filtered screens (Upcoming/Missed/Pending).

export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
