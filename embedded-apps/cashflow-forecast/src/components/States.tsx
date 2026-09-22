'use client';

import { ServerCrash, TriangleAlert } from 'lucide-react';

export function LoadingSkeleton() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="skeleton-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton metric" />
        ))}
      </div>
      <p>Loading CashFlow Intelligence…</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <ServerCrash size={30} />
      <h2>Unable to load dashboard</h2>
      <p>{message}</p>
      <button className="btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <TriangleAlert size={26} />
      <p>{title}</p>
    </div>
  );
}
