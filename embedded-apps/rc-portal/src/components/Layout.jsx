import { NavLink, useNavigate } from 'react-router-dom';
import { useContext, useState } from 'react';
import { AppContext } from '../context/AppContext';
import {
  Loader2, LogOut, User, LayoutDashboard, Folder, Users, Plus,
  ChevronLeft, ChevronRight, Menu, X, ShieldCheck, FileText, Bot
} from 'lucide-react';
import RcChatbot from './RcChatbot';
import TransparentLogo from './TransparentLogo';

export default function Layout({ children }) {
  const { busy } = useContext(AppContext);
  const navigate = useNavigate();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const employeeId = localStorage.getItem('employeeId') || '';
  const employeeName = localStorage.getItem('employeeName') || '';
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
      onClick: () => {
        setIsChatOpen(!isChatOpen);
        setIsMobileDrawerOpen(false);
      },
      icon: Bot,
      isAi: true
    },
    {
      name: 'Add Consultant',
      path: '/onboarding',
      icon: Plus,
      isHighlight: true
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900 shadow-sm shrink-0">
        <div className="flex h-16 w-full items-center justify-between px-3 sm:px-6">

          {/* Left: Mobile Hamburger Toggle / Desktop Collapse Toggle + Brand Logo */}
          <div className="flex items-center gap-2.5 sm:gap-4">

            {/* Desktop Collapse Toggle (≥md) */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer active:scale-95"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>

            {/* Mobile Hamburger Drawer Toggle (<md) */}
            <button
              onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
              className="md:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer active:scale-95"
              title="Toggle Mobile Navigation"
            >
              {isMobileDrawerOpen ? <X className="h-5 w-5 text-slate-300" /> : <Menu className="h-5 w-5 text-slate-300" />}
            </button>

            {/* Brand Logo */}
            <div className="flex items-center cursor-pointer relative" onClick={() => navigate('/')}>
              <TransparentLogo
                src="/apps/rc-portal/emami-logo-new.jpg"
                alt="Emami Group"
                className="h-8 sm:h-10 w-auto object-contain"
              />
            </div>
          </div>

          {/* Right: User Profile Badge Only */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 sm:px-3.5 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rc-indigo-500/20 text-rc-indigo-300 text-[10px] font-semibold border border-rc-indigo-500/30 shrink-0">
                <User className="h-3.5 w-3.5 text-rc-indigo-300" />
              </div>
              <span className="font-mono text-[11px] sm:text-xs font-medium text-slate-300 truncate max-w-[130px] sm:max-w-none">
                {employeeName ? `${employeeName} (${employeeId})` : `ID: ${employeeId}`}
              </span>
              {userRole && (
                <span className="hidden sm:inline-block ml-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider bg-rc-indigo-500/15 text-rc-indigo-300 border border-rc-indigo-500/30">
                  {isSuperadmin ? 'Superadmin' : 'Admin'}
                </span>
              )}
            </div>
          </div>

        </div>
      </header>

      {/* Main Body with Sidebar & Content Workspace */}
      <div className="flex flex-1 relative min-h-[calc(100vh-4.25rem)]">
        
        {/* DESKTOP SIDEBAR (≥md) — matches the EmamiApps hub drawer: white surface, lavender
            hairline border, indigo left-rail + icon-chip active state. */}
        <aside
          className={`hidden md:flex sticky top-[4.25rem] h-[calc(100vh-4.25rem)] bg-white border-r border-rc-indigo-100 text-gray-500 flex-col justify-between transition-all duration-300 z-30 shrink-0 overflow-x-hidden ${
            isCollapsed ? 'w-20' : 'w-[218px]'
          }`}
        >
          {/* Top Navigation Links */}
          <div className="p-2.5 space-y-2 overflow-x-hidden overflow-y-auto scrollbar-none">
            {!isCollapsed && (
              <div className="px-2 py-2 text-[10.5px] font-bold uppercase tracking-widest text-gray-400">
                Main Menu
              </div>
            )}

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;

                if (item.isAction) {
                  return (
                    <button
                      key={item.name}
                      onClick={item.onClick}
                      className={`
                        w-full flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] transition-all group relative cursor-pointer border-l-[3px]
                        ${isChatOpen
                          ? 'bg-rc-teal/10 border-l-rc-teal text-rc-teal font-bold'
                          : 'border-l-transparent text-gray-500 font-medium hover:bg-slate-50'
                        }
                        ${isCollapsed ? 'justify-center px-0' : ''}
                      `}
                      title={isCollapsed ? item.name : undefined}
                    >
                      <span className={`flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] transition-colors ${isChatOpen ? 'bg-rc-teal text-white' : 'text-gray-400'}`}>
                        <Icon className="h-4 w-4" strokeWidth={2.2} />
                      </span>

                      {!isCollapsed && (
                        <span className="truncate flex-1 text-left flex items-center justify-between">
                          <span>{item.name}</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-rc-teal/10 text-rc-teal text-[9px] font-bold uppercase border border-rc-indigo-100">
                            AI
                          </span>
                        </span>
                      )}

                      {/* Tooltip on Collapsed Hover */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                          {item.name} (AI Assistant)
                        </div>
                      )}
                    </button>
                  );
                }

                return (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    className={({ isActive }) => `
                      flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] transition-all group relative cursor-pointer border-l-[3px]
                      ${item.isHighlight
                        ? 'bg-rc-teal hover:bg-rc-teal-dark text-white font-bold border-l-transparent shadow-sm'
                        : isActive
                          ? 'bg-rc-teal/10 border-l-rc-teal text-rc-teal font-bold'
                          : 'border-l-transparent text-gray-500 font-medium hover:bg-slate-50'
                      }
                      ${isCollapsed ? 'justify-center px-0' : ''}
                    `}
                    title={isCollapsed ? item.name : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] transition-colors ${
                          item.isHighlight ? 'text-white' : isActive ? 'bg-rc-teal text-white' : 'text-gray-400'
                        }`}>
                          <Icon className="h-4 w-4" strokeWidth={2.2} />
                        </span>

                        {!isCollapsed && <span className="truncate">{item.name}</span>}

                        {/* Tooltip on Collapsed Hover */}
                        {isCollapsed && (
                          <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                            {item.name}
                          </div>
                        )}
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
              className={`w-full flex items-center gap-2 py-2 px-1.5 rounded-xl text-[13px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer group ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
              title="Log Out"
            >
              <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[9px] text-gray-400 group-hover:text-red-500 transition-colors">
                <LogOut className="h-4 w-4" strokeWidth={2.2} />
              </span>
              {!isCollapsed && <span>Log Out</span>}
            </button>
            {!isCollapsed && (
              <p className="mt-2 px-1.5 text-[11px] text-gray-400">&copy; {new Date().getFullYear()} Emami Limited</p>
            )}
          </div>

        </aside>

        {/* MOBILE SLIDE-OVER DRAWER (<md) */}
        {isMobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex animate-fadeIn">
            {/* Backdrop Overlay */}
            <div
              className="fixed inset-0 bg-slate-900/60 transition-opacity"
              onClick={() => setIsMobileDrawerOpen(false)}
            />

            {/* Slide-out Left Menu */}
            <div className="relative w-72 max-w-[80vw] bg-white text-gray-500 h-full shadow-xl flex flex-col justify-between p-4 border-r border-rc-indigo-100 z-10">
              <div>
                <div className="flex items-center justify-between pb-4 mb-3 border-b border-rc-indigo-100">
                  <div className="flex items-center gap-2">
                    <TransparentLogo src="/apps/rc-portal/emami-logo-new.jpg" alt="Emami" className="h-9 w-auto object-contain" />
                    <span className="text-xs font-semibold tracking-tight text-slate-900">RC Portal Navigation</span>
                  </div>
                  <button
                    onClick={() => setIsMobileDrawerOpen(false)}
                    className="p-1.5 rounded-lg bg-slate-100 text-gray-500 hover:text-slate-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <nav className="space-y-1.5">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    if (item.isAction) {
                      return (
                        <button
                          key={item.name}
                          onClick={() => {
                            item.onClick();
                            setIsMobileDrawerOpen(false);
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 text-[13px] font-medium text-gray-500 border-l-[3px] border-l-transparent hover:bg-slate-100"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-[27px] w-[27px] items-center justify-center rounded-[9px] text-gray-400">
                              <Icon className="h-4 w-4" strokeWidth={2.2} />
                            </span>
                            <span>{item.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-rc-teal/10 text-rc-teal text-[9px] font-bold uppercase border border-rc-indigo-100">
                            AI
                          </span>
                        </button>
                      );
                    }

                    return (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => setIsMobileDrawerOpen(false)}
                        className={({ isActive }) => `
                          flex items-center gap-3 p-3 rounded-xl text-[13px] transition-all border-l-[3px]
                          ${item.isHighlight
                            ? 'bg-rc-teal text-white font-bold border-l-transparent shadow-sm'
                            : isActive
                              ? 'bg-rc-teal/10 border-l-rc-teal text-rc-teal font-bold'
                              : 'text-gray-500 font-medium border-l-transparent hover:bg-slate-50'
                          }
                        `}
                      >
                        {({ isActive }) => (
                          <>
                            <span className={`flex h-[27px] w-[27px] items-center justify-center rounded-[9px] ${
                              item.isHighlight ? 'text-white' : isActive ? 'bg-rc-teal text-white' : 'text-gray-400'
                            }`}>
                              <Icon className="h-4 w-4" strokeWidth={2.2} />
                            </span>
                            <span>{item.name}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </nav>
              </div>

              {/* Mobile Drawer Logout */}
              <div className="pt-3 border-t border-rc-indigo-100">
                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-[13px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                >
                  <span className="flex h-[27px] w-[27px] items-center justify-center rounded-[9px] text-gray-400">
                    <LogOut className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <span>Log Out</span>
                </button>
                <p className="mt-2 px-1 text-[11px] text-gray-400">&copy; {new Date().getFullYear()} Emami Limited</p>
              </div>
            </div>
          </div>
        )}

        {/* Workspace Content Panel (100% Widescreen on Mobile) */}
        <main className="flex-1 min-w-0 px-3 sm:px-8 py-6 w-full">
          {children}
        </main>

      </div>

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
