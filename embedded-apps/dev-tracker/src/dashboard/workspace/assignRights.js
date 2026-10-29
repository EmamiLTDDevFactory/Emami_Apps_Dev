import { useEffect, useState } from 'react';
import { ccbApi } from '../../ccb/api.js';

// "Task Assigned to" can only be set by a Module Lead or the IT Application Head (their CCB roles). The
// server enforces the same rule (backend/devTracker.js) — this only decides whether the field is editable.
export const ASSIGN_ROLES = ['Module Lead', 'IT Application Head'];

let pending = null;
export function useCanAssign() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let live = true;
    pending = pending || ccbApi.me().then((d) => (d.me?.roles || []).some((r) => ASSIGN_ROLES.includes(r))).catch(() => { pending = null; return false; });
    pending.then((v) => { if (live) setCan(v); });
    return () => { live = false; };
  }, []);
  return can;
}
