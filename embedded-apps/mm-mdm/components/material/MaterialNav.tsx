'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMdm } from '@/lib/store';
import { IconBox } from '../icons';

export default function MaterialNav() {
  const path = usePathname();
  const { waiting } = useMdm();
  const tabs = [
    { href: '/master/material', label: 'Home', exact: true, count: waiting },
    { href: '/master/material/new', label: 'New material request', exact: false, count: 0 },
    { href: '/master/material/requests', label: 'Requests', exact: false, count: 0 },
    // Change (MX) and extension (ME) start from a posted material
    { href: '/master/material/data', label: 'Material master data', exact: false, count: 0, also: ['/master/material/change', '/master/material/extend'] },
  ];
  return (
    <div className="page-top">
      <div className="page-title">
        <span className="page-icon" aria-hidden><IconBox size={22} /></span>
        <div>
          <span className="tcode-chip">ZMDM_M</span>
          <h1>Material master governance</h1>
        </div>
      </div>
      <nav className="tabs page-tabs" aria-label="Material master">
        {tabs.map((t) => {
          const active = t.exact ? path === t.href : [t.href, ...(t.also ?? [])].some((p) => path.startsWith(p));
          return (
            <Link key={t.href} href={t.href} className={`tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
              {t.label}
              {t.count > 0 && <span className="tab-count">{t.count}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
