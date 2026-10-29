import { revisedTarget, todayStr } from './utils.js';
import { bandFor, MAX_CONCURRENT } from './constants.js';
import { peopleIn } from './resourceUtil.js';

// Ported from resource-utilization.js buildRoster()/render(). One roster entry per
// distinct (role, name): the same item can populate BOTH a Developer's and a
// Functional SPOC's roster entry (double effort counting) — preserved intentionally,
// as is including Completed items in concurrency (only Cancelled is skipped).
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function mostCommon(values) {
  const counts = {};
  let best = null;
  let bestCount = 0;
  for (const v of values) {
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > bestCount) {
      bestCount = counts[v];
      best = v;
    }
  }
  return best;
}

export function buildRoster(items) {
  const roster = {}; // key: `${role}::${name}`

  const addWindow = (role, name, row) => {
    if (!name) return;
    const key = `${role}::${name}`;
    if (!roster[key]) {
      roster[key] = { role, name, items: [], tagSource: [] };
    }
    const entry = roster[key];
    entry.tagSource.push(role === 'Developer' ? row.devFactory : row.area);

    const start = parseLocalDate(row.startDate);
    const end = parseLocalDate(revisedTarget(row));
    const windowOk = start && end && end >= start;
    if (windowOk) {
      entry.items.push({
        start,
        end,
        devDays: Number(row.devTime) || 0,
        area: row.area,
        title: row.devList,
        targetLabel: revisedTarget(row),
        completed: row.status === 'Completed',
        overdue: !['Completed', 'Cancelled'].includes(row.status) && revisedTarget(row) && revisedTarget(row) < todayStr(),
      });
    }
  };

  for (const row of items || []) {
    if (row.status === 'Cancelled') continue;
    // Each person named (Task Assigned to can hold several) carries the assignment on their own row.
    for (const name of peopleIn(row.developer)) addWindow('Developer', name, row);
    for (const name of peopleIn(row.spocFunction)) addWindow('Functional SPOC', name, row);
  }

  return Object.values(roster).map((entry) => ({
    ...entry,
    tag: mostCommon(entry.tagSource),
  }));
}

export function remainingDays(it, asOf) {
  const totalSpan = Math.round((it.end - it.start) / 86400000) + 1;
  if (totalSpan <= 0) return 0;
  const daysLeft = Math.round((it.end - asOf) / 86400000) + 1;
  const frac = Math.max(0, Math.min(1, daysLeft / totalSpan));
  return it.devDays * frac;
}

export function computeConcurrency(roster, asOf) {
  return roster.map((entry) => {
    const concurrentItems = entry.items.filter((it) => it.start <= asOf && it.end >= asOf);
    const concurrent = concurrentItems.length;
    // Matches the original: planned/remaining effort is summed over only the items
    // concurrently active as of `asOf`, not every item ever assigned to this person.
    const devDaysPlanned = concurrentItems.reduce((sum, it) => sum + it.devDays, 0);
    const devDaysRemaining = concurrentItems.reduce((sum, it) => sum + remainingDays(it, asOf), 0);
    return {
      ...entry,
      concurrentItems,
      concurrent,
      devDaysPlanned,
      devDaysRemaining,
      band: bandFor(concurrent),
      spectrumFrac: Math.min(concurrent, MAX_CONCURRENT) / MAX_CONCURRENT,
    };
  });
}
