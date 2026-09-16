'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, HeartPulse, ShieldCheck, BarChart3, ArrowLeft, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { nameFromEmail } from '../lib/hubEmailLogin';

// next/link's `href` auto-prepends next.config.js's basePath — nav hrefs below are written
// WITHOUT it. Plain <img> tags get no such help, so this is the one place that constant is
// spelled out — same convention every sibling app's own SidePane/Shell follows (see
// embedded-apps/timesheet/src/components/gates/BASE_PATH.ts).
const BASE_PATH = '/apps/insurance-policy';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: LayoutGrid },
  { href: '/mediclaim/', label: 'Mediclaim Policy', icon: HeartPulse },
  { href: '/term-policy/', label: 'Term Policy', icon: ShieldCheck },
];
const ADMIN_NAV_ITEM = { href: '/admin/', label: 'Admin Reports', icon: BarChart3 };

export default function SidePane({
  isOpen,
  onClose,
  isWideScreen,
}: {
  isOpen: boolean;
  onClose: () => void;
  isWideScreen: boolean;
}) {
  const pathname = usePathname();
  const { email, isAdmin } = useApp();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  const paneClasses = isWideScreen
    ? 'relative w-56 shrink-0'
    : `fixed inset-y-0 left-0 z-40 w-64 max-w-[80vw] transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
      {!isWideScreen && isOpen && <div className="fixed inset-0 z-30 bg-plumDeep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={`glass-panel m-0 flex flex-col rounded-none border-y-0 border-l-0 ${paneClasses}`}>
        <div className="border-b border-glassBorder">
          {!isWideScreen && (
            <div className="flex justify-end px-3 pt-3">
              <button onClick={onClose} aria-label="Close menu" className="p-1 text-inkSoft hover:text-ink">
                <X size={18} />
              </button>
            </div>
          )}
          {/* The Emami Apps wordmark lives here only — no other place in this app repeats it. */}
          <Link
            href="/"
            onClick={() => {
              if (!isWideScreen) onClose();
            }}
            className={`flex flex-col items-center justify-center gap-1 px-4 ${isWideScreen ? 'pt-4' : 'pt-1'} pb-4`}
            aria-label="Go to Mediclaim & Term Policy home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={80} height={66} />
            <span className="text-center text-[12.5px] font-bold leading-tight tracking-tight text-ink">
              Mediclaim &amp; Term Policy
            </span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2.5">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (!isWideScreen) onClose();
                }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-bold transition-colors ${
                  active ? 'bg-glassRust text-rust' : 'text-inkSoft hover:bg-white/50 hover:text-ink'
                }`}
              >
                <Icon size={15} />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-glassBorder p-3">
          {email && (
            <div className="truncate rounded-lg border border-border bg-appBg px-2.5 py-1.5 text-[11.5px] font-bold text-ink">
              {nameFromEmail(email)}
            </div>
          )}
          <a href="/" className="btn-ghost w-full !px-2.5 !py-1.5 text-[11.5px]">
            <ArrowLeft size={13} />
            Back to Emami Apps
          </a>
        </div>
      </aside>
    </>
  );
}
