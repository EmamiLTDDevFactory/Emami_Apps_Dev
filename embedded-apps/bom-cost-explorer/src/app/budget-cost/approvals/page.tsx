'use client';
// The old Budget approvals page: approvals are now a tab of the Budget page, so this only forwards old links and bookmarks.
import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/client/session';
import { budgetApprovalsTarget } from '@/lib/budget/tabs';

export default function Page() {
  useEffect(() => { window.location.replace(budgetApprovalsTarget(BASE_PATH)); }, []);
  return <p className="p-6 text-sm text-muted">Opening Budget approvals…</p>;
}
