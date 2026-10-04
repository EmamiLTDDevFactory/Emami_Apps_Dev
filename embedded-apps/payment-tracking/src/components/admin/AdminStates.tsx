'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { Spinner } from '../ui';

/** Shown while the signed-in user's role is still resolving (original: centred large spinner). */
export function RoleLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size={24} />
    </div>
  );
}

/** Admin-only route guard message (original: lock icon + one line of text). */
export function AdminDenied({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Lock size={22} className="text-inkSoft" />
      <p className="text-sm text-inkSoft">{message}</p>
    </div>
  );
}
