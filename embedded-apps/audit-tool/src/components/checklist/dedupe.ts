// The source controllers' dedupe idiom, reproduced literally:
//   Object.values(rows.reduce((acc, cur) => Object.assign(acc, { [cur.X]: cur }), {}))
// Kept as a plain-object reduce (not a Map) on purpose — JS orders integer-like object keys
// ("2024", "2025", …) ascending ahead of string keys, so option lists keyed by years come out in
// the same order as in the Fiori app. The last row per key wins, as in the original.
export function objectValuesBy<T extends Record<string, any>>(rows: T[] | null | undefined, key: string): T[] {
  const acc: Record<string, T> = {};
  for (const cur of rows || []) Object.assign(acc, { [cur[key]]: cur });
  return Object.values(acc);
}
