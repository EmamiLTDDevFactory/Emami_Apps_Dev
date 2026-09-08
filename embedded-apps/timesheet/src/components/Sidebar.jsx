import { useApp } from '../context/AppContext'
import emamiLogo from '../assets/emami-logo.png'

const EMPLOYEE_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠', chip: 'bg-indigo-100 text-indigo-600' },
  { key: 'my-timesheet', label: 'My Timesheet', icon: '🗓️', chip: 'bg-sky-100 text-sky-600' },
  { key: 'history', label: 'My Timesheets History', icon: '📜', chip: 'bg-amber-100 text-amber-600' },
]

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-indigo-500',
  'from-fuchsia-500 to-pink-500',
  'from-emerald-500 to-teal-500',
]

function avatarGradient(id) {
  let hash = 0
  for (const ch of id || '') hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[hash]
}

export default function Sidebar({ page, onNavigate, mobileOpen, onCloseMobile }) {
  const { currentUser, logout } = useApp()

  const NavButton = ({ item }) => {
    const active = page === item.key
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate(item.key)
          onCloseMobile?.()
        }}
        aria-current={active ? 'page' : undefined}
        className={`group relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          active
            ? 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.15)]'
            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`}
      >
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500 transition-opacity ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
        <span className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-sm ${item.chip}`} aria-hidden="true">
          {item.icon}
        </span>
        {item.label}
      </button>
    )
  }

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`fixed z-40 inset-y-0 left-0 w-64 bg-gradient-to-b from-white via-indigo-50/50 to-violet-50/40 backdrop-blur border-r border-indigo-100/70 flex flex-col transform transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-24 flex items-center gap-2.5 px-5 border-b border-slate-200/80">
          <img src={emamiLogo} alt="Emami Group" className="h-16 w-16 object-contain" />
          <span className="font-bold text-slate-900 tracking-tight">TimeSheet</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {EMPLOYEE_NAV.filter((item) => currentUser?.role !== 'manager').map((item) => (
            <NavButton key={item.key} item={item} />
          ))}
        </nav>

        <div className="border-t border-slate-200/80 p-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-9 w-9 rounded-full bg-gradient-to-br ${avatarGradient(currentUser?.id)} flex items-center justify-center text-sm font-semibold text-white shadow-sm`}
            >
              {currentUser?.name?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{currentUser?.name}</p>
              <p className="text-xs text-slate-500 capitalize truncate">{currentUser?.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm font-medium text-center rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 py-1.5 text-slate-700 hover:from-slate-100 hover:to-slate-200 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <span aria-hidden="true">🏠</span>
            Back to Emami Apps
          </button>
        </div>
      </aside>
    </>
  )
}
