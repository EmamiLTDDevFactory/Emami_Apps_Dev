import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiList, apiMasterData, apiUpdate, apiCreate, apiDelete, apiSprints } from '../../shared/api.js';
import { activeValues, categoryColorMap } from '../../shared/masterData.js';
import { CATEGORIES } from '../../shared/constants.js';
import { buildPayload, isEpic } from '../../shared/pm.js';

// One data layer for every workspace view (board, backlog, list, timeline, reports) and the
// issue view, so an edit made in one place is visible everywhere without a refetch.
//
// `pmReady` is false while the deployed API predates the project-management columns (items come
// back without issueNo) or the /sprints route: the UI then hides sprint/epic/comment controls
// instead of letting someone type into fields the server would silently drop.
export function useWorkspace(email) {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [sprintsOk, setSprintsOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const reloadSprints = useCallback(async () => {
    try {
      setSprints((await apiSprints(email)) || []);
      setSprintsOk(true);
    } catch {
      setSprints([]);
      setSprintsOk(false);
    }
  }, [email]);

  const reload = useCallback(async () => {
    try {
      const [itemRows, mdRows] = await Promise.all([apiList(email), apiMasterData(email), reloadSprints()]);
      setItems(itemRows || []);
      setMasterData(mdRows || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load items');
    }
  }, [email, reloadSprints]);

  useEffect(() => {
    if (!email) return;
    reload().finally(() => setLoading(false));
  }, [email]);

  const pmReady = sprintsOk && (items.length === 0 || items.some((it) => it.issueNo != null));

  const options = useMemo(() => {
    const out = {};
    for (const cat of CATEGORIES) out[cat.key] = activeValues(masterData, cat.key);
    return out;
  }, [masterData]);
  const statusOrder = useMemo(() => {
    const list = options.status && options.status.length ? [...options.status] : [];
    // Keep any status that's on an item but was retired from master data, so it still gets a column.
    for (const it of items) if (it.status && !list.includes(it.status)) list.push(it.status);
    return list;
  }, [options.status, items]);
  const colors = useMemo(() => ({
    area: categoryColorMap(masterData, 'area'),
    status: categoryColorMap(masterData, 'status'),
    priority: categoryColorMap(masterData, 'priority'),
  }), [masterData]);

  const byId = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items]);
  const epics = useMemo(() => items.filter(isEpic), [items]);
  const people = useMemo(() => {
    const s = new Set();
    for (const it of items) for (const v of [it.developer, it.spocIT, it.spocFunction, it.reporter]) if (v && v.trim()) s.add(v.trim());
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const activeSprint = useMemo(() => sprints.find((s) => s.state === 'active') || null, [sprints]);

  // Optimistic: the change shows immediately and rolls back if the save fails. The server's row
  // replaces the local one afterwards, so server-assigned values (updatedAt) stay accurate.
  const updateItem = useCallback(async (id, patch) => {
    const current = itemsRef.current.find((it) => String(it.id) === String(id));
    if (!current) return null;
    const payload = buildPayload(current, patch);
    const optimistic = { ...current, ...payload };
    setItems((cur) => cur.map((it) => (String(it.id) === String(id) ? optimistic : it)));
    try {
      const saved = await apiUpdate(id, payload, email);
      if (saved) setItems((cur) => cur.map((it) => (String(it.id) === String(id) ? { ...optimistic, ...saved } : it)));
      return saved;
    } catch (e) {
      setItems((cur) => cur.map((it) => (String(it.id) === String(id) ? current : it)));
      throw e;
    }
  }, [email]);

  const createItem = useCallback(async (fields) => {
    const saved = await apiCreate(buildPayload({}, fields), email);
    if (saved) setItems((cur) => [...cur, saved]);
    return saved;
  }, [email]);

  const deleteItem = useCallback(async (id) => {
    await apiDelete(id, email);
    setItems((cur) => cur
      .filter((it) => String(it.id) !== String(id))
      .map((it) => (String(it.epicId) === String(id) || String(it.parentId) === String(id)
        ? { ...it, epicId: String(it.epicId) === String(id) ? null : it.epicId, parentId: String(it.parentId) === String(id) ? null : it.parentId }
        : it)));
  }, [email]);

  return {
    items, setItems, masterData, sprints, loading, error, pmReady,
    options, statusOrder, colors, byId, epics, people, activeSprint,
    reload, reloadSprints, updateItem, createItem, deleteItem,
  };
}
