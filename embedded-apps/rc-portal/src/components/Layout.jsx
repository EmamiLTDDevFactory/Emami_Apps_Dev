import { NavLink, useNavigate } from 'react-router-dom';
import { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Loader2, LogOut, LayoutDashboard, Folder, Plus,
  ShieldCheck, Bot, BarChart3
} from 'lucide-react';
import RcChatbot from './RcChatbot';

export default function Layout({ children }) {
  const { busy } = useContext(AppContext);
  const navigate = useNavigate();

  const [isChatOpen, setIsChatOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">

      {/* Sidebar — matches the EmamiApps hub drawer: white surface, lavender hairline border,
          indigo left-rail + icon-chip active state, 172px centered logo like the hub's brandRow.
          No top header bar and no collapse/mobile-drawer toggle — this is the only navigation
          chrome, always shown, on every screen size. */}
      <aside className="flex sticky top-0 h-screen w-[218px] bg-white border-r border-rc-indigo-100 text-gray-500 flex-col justify-between shrink-0 overflow-x-hidden">
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

        {/* Navigation Links */}
        <div className="px-2.5 pb-2.5 space-y-2 overflow-x-hidden overflow-y-auto scrollbar-none">
          <div className="px-2 py-2 text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
            Main Menu
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;

              if (item.isAction) {
                return (
                  <button
                    key={item.name}
                    onClick={item.onClick}
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
        </div>

        {/* Bottom Sidebar Footer (Anchored Logout Button) */}
        <div className="p-2.5 border-t border-rc-indigo-100">
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
      </aside>

      {/* Workspace Content Panel */}
      <main className="flex-1 min-w-0 px-3 sm:px-8 py-6 w-full">
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
