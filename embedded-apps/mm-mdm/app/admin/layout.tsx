import type { ReactNode } from 'react';

/** The admin screens sit inside the standard page frame (padding, max width, no spill past the viewport). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="page admin-page">{children}</div>;
}
