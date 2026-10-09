import { NavLink, useNavigate } from 'react-router-dom';
import { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Loader2, LogOut, LayoutDashboard, Folder, Plus,
  ShieldCheck, Bot, BarChart3, Menu, X, ArrowLeft
} from 'lucide-react';
import { goBack } from '../lib/goBack';
import RcChatbot from './RcChatbot';

export default function Layout({ children }) {
  const { busy } = useContext(AppContext);
  const navigate = useNavigate();

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const userRole = (localStorage.getItem('employeeRole') || '').trim();
  const isSuperadmin = userRole === 'S' || userRole === 'Superadmin';

  const handleLogout = () => {
    // Clear only this app's own session, not the whole origin's localStorage — that would also
    // wipe the EmamiApps hub's login (emami_apps_* keys), same-origin — and send the user back to
    // the hub's Dashboard instead of RC Portal's own login page.
    sessionStorage.clear();
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeRole');
    localStorage.removeItem('employeeTa');
    localStorage.removeItem('employeeTm');
    localStorage.removeItem('employeeLd');
    localStorage.removeItem('employeeOd');
    window.location.href = '/';
  };

  const navItems = [
    {
      name: 'Dashboard',
      path: '/',
      icon: LayoutDashboard,
    },
    {
      name: 'Analytics',
      path: '/analytics',
      icon: BarChart3,
    },
    {
      name: 'Add Consultant',
      path: '/onboarding',
      icon: Plus,
      isHighlight: true
    },
    {
      name: 'Document Hub',
      path: '/files',
      icon: Folder,
    },
    ...(isSuperadmin ? [{
      name: 'Manage Roles',
      path: '/roles',
      icon: ShieldCheck,
    }] : []),
    {
      name: 'RC Assistant',
      isAction: true,
      onClick: () => setIsChatOpen(!isChatOpen),
      icon: Bot,
      isAi: true
    }
  ];

  // Shared between the desktop sidebar and the mobile slide-over drawer so the two never drift
  // out of sync. `afterClick` runs on top of each item's own action (closes the mobile drawer
  // after navigating or opening the chatbot; a no-op on desktop, which has nothing to close).
  function renderNavList(afterClick) {
    return (
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isAction) {
            return (
              <button
                key={item.name}
                onClick={() => { item.onClick(); afterClick(); }}
                className={`
                  w-full flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] transition-all cursor-pointer border-l-[3px]
                  ${isChatOpen
                    ? 'bg-rc-teal/10 border-l-rc-teal text-rc-teal font-bold'
                    : 'border-l-transparent text-gray-500 font-medium hover:bg-slate-50'
                  }
                `}
              >
                <span className={`flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] transition-colors ${isChatOpen ? 'bg-rc-teal text-white' : 'text-gray-400'}`}>
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>

                <span className="truncate flex-1 text-left flex items-center justify-between">
                  <span>{item.name}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-rc-teal/10 text-rc-teal text-[9px] font-bold uppercase border border-rc-indigo-100">
                    AI
                  </span>
                </span>
              </button>
            );
          }

          return (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={afterClick}
              className={({ isActive }) => `
                flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] transition-all cursor-pointer border-l-[3px]
                ${item.isHighlight
                  ? 'bg-rc-teal hover:bg-rc-teal-dark text-white font-bold border-l-transparent shadow-sm'
                  : isActive
                    ? 'bg-rc-teal/10 border-l-rc-teal text-rc-teal font-bold'
                    : 'border-l-transparent text-gray-500 font-medium hover:bg-slate-50'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] transition-colors ${
                    item.isHighlight ? 'text-white' : isActive ? 'bg-rc-teal text-white' : 'text-gray-400'
                  }`}>
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <span className="truncate">{item.name}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    );
  }

  function renderFooter() {
    return (
      <div className="p-2.5 border-t border-rc-indigo-100">
        <button
          type="button"
          onClick={goBack}
          className="mb-1 w-full flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] font-medium text-gray-500 hover:text-rc-teal hover:bg-slate-50 transition-all cursor-pointer group"
          title="Back"
        >
          <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] text-gray-400 group-hover:text-rc-teal transition-colors">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span>Back</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer group"
          title="Log Out"
        >
          <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] text-gray-400 group-hover:text-red-500 transition-colors">
            <LogOut className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span>Log Out</span>
        </button>
        <p className="mt-2 px-1.5 text-[11px] text-gray-400">&copy; {new Date().getFullYear()} Emami Limited</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">

      {/* DESKTOP SIDEBAR (≥md) — matches the EmamiApps hub drawer: white surface, lavender
          hairline border, indigo left-rail + icon-chip active state, 172px centered logo like
          the hub's brandRow. Always visible, no collapse toggle. */}
      <aside className="hidden md:flex sticky top-0 h-screen w-[218px] bg-white border-r border-rc-indigo-100 text-gray-500 flex-col justify-between shrink-0 overflow-x-hidden">
        {/* Brand Logo — plain <img>, matching the hub's own unprocessed rendering (not
            TransparentLogo's brightness-boosted, tightly-cropped canvas output). */}
        <div
          className="flex items-center justify-center cursor-pointer pt-4 px-4 pb-[18px]"
          onClick={() => navigate('/')}
        >
          <img
            src="/apps/rc-portal/emami-logo-new.jpg"
            alt="Emami Group"
            className="h-auto w-[172px] object-contain"
          />
        </div>

        <div className="px-2.5 pb-2.5 space-y-2 overflow-x-hidden overflow-y-auto scrollbar-none">
          <div className="px-2 py-2 text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
            Main Menu
          </div>
          {renderNavList(() => {})}
        </div>

        {renderFooter()}
      </aside>

      {/* MOBILE FLOATING MENU BUTTON (<md) — the sidebar is hidden on narrow screens (it can't
          fit alongside real content at a fixed 218px), so this is the only way to open
          navigation there. Fixed position, always reachable regardless of scroll position. */}
      <button
        onClick={() => setIsMobileNavOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 flex items-center justify-center h-11 w-11 rounded-full bg-white border border-rc-indigo-100 text-rc-teal shadow-md cursor-pointer active:scale-95 transition"
        title="Open navigation"
      >
        <Menu className="h-5 w-5" strokeWidth={2.2} />
      </button>

      {/* MOBILE SLIDE-OVER DRAWER (<md) */}
      {isMobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex animate-fadeIn">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setIsMobileNavOpen(false)}
          />

          <div className="relative w-72 max-w-[80vw] bg-white text-gray-500 h-full shadow-xl flex flex-col justify-between z-10">
            <div
              className="flex items-center justify-center cursor-pointer pt-6 px-4 pb-[18px] border-b border-rc-indigo-100"
              onClick={() => { setIsMobileNavOpen(false); navigate('/'); }}
            >
              <img
                src="/apps/rc-portal/emami-logo-new.jpg"
                alt="Emami Group"
                className="h-auto w-[152px] object-contain"
              />
            </div>

            <button
              onClick={() => setIsMobileNavOpen(false)}
              className="absolute right-3 top-3 p-1.5 rounded-lg bg-slate-100 text-gray-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex-1 px-2.5 pt-3 space-y-2 overflow-x-hidden overflow-y-auto scrollbar-none">
              {renderNavList(() => setIsMobileNavOpen(false))}
            </div>

            {renderFooter()}
          </div>
        </div>
      )}

      {/* Workspace Content Panel */}
      <main className="flex-1 min-w-0 px-3 sm:px-8 py-6 pt-20 md:pt-6 w-full">
        {children}
      </main>

      {/* Controlled Global AI Chatbot Drawer */}
      <RcChatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-lg border border-slate-200">
            <Loader2 className="h-8 w-8 animate-spin text-rc-teal" />
            <span className="text-sm font-medium text-slate-600">Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
