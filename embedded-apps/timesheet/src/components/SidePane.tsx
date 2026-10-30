'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarClock,
  History as HistoryIcon,
  ClipboardCheck,
  Users,
  BarChart3,
  Building2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BASE_PATH } from './gates/BASE_PATH';

const WIDE_BREAKPOINT = 768; // matches the hub's own useIsWideScreen + every sibling embedded app

// One sidepane for both roles, replacing the old Sidebar.jsx (employee-only, zero items for a
// manager) + TopNav.jsx (manager-only horizontal strip) split — a manager now gets Dashboard as
// the first item here, same as every other role, instead of navigating through a separate top
// bar with no Dashboard entry point of its own in the side nav at all.
const EMPLOYEE_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/my-timesheet/', label: 'My Timesheet', icon: CalendarClock },
  { href: '/history/', label: 'History', icon: HistoryIcon },
];
const MANAGER_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/team-approvals/', label: 'Team Approvals', icon: ClipboardCheck },
  { href: '/team-history/', label: 'Team History', icon: HistoryIcon },
  { href: '/manage-team/', label: 'Manage Team', icon: Users },
  { href: '/team-reports/', label: 'Team Reports', icon: BarChart3 },
];
// Only for the hub's Super Admins (currentUser.isSuperAdmin), on top of whichever list above.
const SUPER_ADMIN_NAV = [{ href: '/all-employees/', label: 'All Employees', icon: Building2 }];

function useIsWideScreen() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

export function useIsWideScreenExport() {
  return useIsWideScreen();
}

export default function SidePane({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isWideScreen = useIsWideScreen();
  const { currentUser } = useApp();
  const isManager = currentUser?.role === 'manager';
  const navItems = [...(isManager ? MANAGER_NAV : EMPLOYEE_NAV), ...(currentUser?.isSuperAdmin ? SUPER_ADMIN_NAV : [])];

  const paneClasses = isWideScreen
    ? 'relative w-64 shrink-0'
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[80vw] transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
      {!isWideScreen && isOpen && <div className="fixed inset-0 z-30 bg-plumDeep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={`glass-panel m-0 flex flex-col rounded-none border-y-0 border-l-0 ${paneClasses}`}>
        <div className="border-b border-glassBorder">
          {!isWideScreen && (
            <div className="flex justify-end px-3 pt-3">
              <button onClick={onClose} aria-label="Close menu" className="p-1 text-inkSoft hover:text-ink">
                <X size={20} />
              </button>
            </div>
          )}
          <Link
            href="/"
            onClick={() => {
              if (!isWideScreen) onClose();
            }}
            className={`flex flex-col items-center justify-center gap-1.5 px-4 ${isWideScreen ? 'pt-5' : 'pt-1'} pb-5`}
            aria-label="Go to Timesheet dashboard"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={120} height={99} />
            <span className="text-sm font-bold tracking-tight text-ink">TimeSheet</span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (!isWideScreen) onClose();
                }}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${
                  active ? 'bg-glassRust text-rust' : 'text-inkSoft hover:bg-white/50 hover:text-ink'
                }`}
              >
                <Icon size={18} />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
