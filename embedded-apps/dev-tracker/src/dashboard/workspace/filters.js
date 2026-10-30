import { isOverdue } from '../../shared/utils.js';
import { UNCLASSIFIED, landscapeOf } from '../../shared/masterData.js';
import { issueKey, nameMatches, isDone, parseLabels, splitPeople } from '../../shared/pm.js';

// One filter object shared by board, backlog, list and timeline, so switching views keeps the
// same slice of work on screen (Jira's quick filters behave the same way across a project).
export const EMPTY_FILTERS = {
  search: '',
  assignees: [], // developer names; '__none__' = unassigned
  onlyMine: false,
  recent: false,
  epics: [], // epic ids; '__none__' = no epic
  types: [],
  areas: [],
  landscapes: [], // 'SAP' | 'Non-SAP' | 'Not classified' — derived from the Module's group in Master Data
  labels: [],
  status: '',
  priority: '',
  overdueOnly: false,
  lifecycle: '', // '' | 'active' | 'completed' — Home's KPI drill-downs
  impact: '',
  complexity: '',
  devFactory: '',
  reasonCategory: '',
  dateStart: '',
  dateEnd: '',
};
export const UNASSIGNED = '__none__';

export function activeFilterCount(f) {
  let n = 0;
  for (const [k, v] of Object.entries(f)) {
    if (k === 'search') continue;
    if (Array.isArray(v) ? v.length : v) n++;
  }
  return n;
}

export function applyFilters(items, f, { myNames = [], areaGroupOf = {} } = {}) {
  const q = f.search.trim().toLowerCase();
  const assignees = new Set(f.assignees);
  const epics = new Set(f.epics);
  const types = new Set(f.types);
  const areas = new Set(f.areas);
  const landscapes = new Set(f.landscapes || []);
  const labels = new Set(f.labels);
  const weekAgo = Date.now() - 7 * 86400000;
  return items.filter((it) => {
    if (assignees.size) {
      const devs = splitPeople(it.developer);
      if (!(devs.length ? devs.some((d) => assignees.has(d)) : assignees.has(UNASSIGNED))) return false;
    }
    if (f.onlyMine && ![it.developer, it.spocIT, it.spocFunction].some((v) => nameMatches(v, myNames))) return false;
    if (f.recent) {
      const t = new Date(it.updatedAt || it.createdAt || 0).getTime();
      if (!(t >= weekAgo)) return false;
    }
    if (epics.size) {
      const e = it.epicId ? String(it.epicId) : UNASSIGNED;
      if (!epics.has(e) && !epics.has(String(it.id))) return false;
    }
    if (types.size && !types.has(it.issueType || 'Task')) return false;
    if (areas.size && !areas.has(it.area)) return false;
    if (landscapes.size && !landscapes.has(landscapeOf(it.area, areaGroupOf) || UNCLASSIFIED)) return false;
    if (labels.size && !parseLabels(it.labels).some((l) => labels.has(l))) return false;
    if (f.status && it.status !== f.status) return false;
    if (f.priority && it.priority !== f.priority) return false;
    if (f.overdueOnly && !isOverdue(it)) return false;
    if (f.lifecycle === 'active' && isDone(it)) return false;
    if (f.lifecycle === 'completed' && it.status !== 'Completed') return false;
    if (f.impact && it.impact !== f.impact) return false;
    if (f.complexity && it.complexity !== f.complexity) return false;
    if (f.devFactory && it.devFactory !== f.devFactory) return false;
    if (f.reasonCategory && it.reasonCategory !== f.reasonCategory) return false;
    if (f.dateStart && (!it.targetDate || it.targetDate < f.dateStart)) return false;
    if (f.dateEnd && (!it.targetDate || it.targetDate > f.dateEnd)) return false;
    if (q) {
      const hay = [issueKey(it), it.devList, it.func, it.developer, it.remarks, it.spocFunction, it.spocIT, it.labels, it.description, it.area, landscapeOf(it.area, areaGroupOf)]
        .map((v) => String(v || '').toLowerCase()).join(' ');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
