import { useApp } from '../context/AppContext'
import { useTheme, THEMES } from '../context/ThemeContext'
import emamiLogo from '../assets/emami-apps-logo.png'

const EMPLOYEE_NAV = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    chip: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
    activeBg:
      'bg-gradient-to-r from-blue-50 to-sky-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)] dark:from-blue-500/15 dark:to-sky-500/10 dark:text-blue-200 dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]',
    bar: 'bg-gradient-to-b from-blue-500 to-sky-500',
  },
  {
    key: 'my-timesheet',
    label: 'My Timesheet',
    icon: '🗓️',
    chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300',
    activeBg:
      'bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.18)] dark:from-violet-500/15 dark:to-purple-500/10 dark:text-violet-200 dark:shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]',
    bar: 'bg-gradient-to-b from-violet-500 to-purple-500',
  },
  {
    key: 'history',
    label: 'My Timesheets History',
    icon: '📜',
    chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
    activeBg:
      'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.18)] dark:from-amber-500/15 dark:to-orange-500/10 dark:text-amber-200 dark:shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]',
    bar: 'bg-gradient-to-b from-amber-500 to-orange-500',
  },
]

// Minimal theme collapses every section's accent to one calm color instead of
// a distinct hue per section - same nav structure, single indigo accent.
const MINIMAL_NAV = EMPLOYEE_NAV.map((item) => ({
  ...item,
  chip: 'bg-indigo-100 text-indigo-600',
  activeBg: 'bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.18)]',
  bar: 'bg-indigo-500',
}))

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
  const { currentUser, getUserById } = useApp()
  const { theme, setTheme, isMinimal } = useTheme()
  const navItems = isMinimal ? MINIMAL_NAV : EMPLOYEE_NAV
  const manager = currentUser?.managerId ? getUserById(currentUser.managerId) : null

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
          active ? item.activeBg : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-50'
        }`}
      >
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full ${item.bar} transition-opacity ${
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
        className={`fixed z-40 inset-y-0 left-0 w-64 bg-gradient-to-b from-white via-indigo-50/50 to-violet-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 backdrop-blur border-r border-indigo-100/70 dark:border-slate-800 flex flex-col transform transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col items-center gap-2 px-6 py-6 border-b border-slate-200/80 dark:border-slate-800">
          <img src={emamiLogo} alt="Emami Group" className="w-44 h-auto max-w-full object-contain" />
          <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight">TimeSheet</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.filter((item) => currentUser?.role !== 'manager').map((item) => (
            <NavButton key={item.key} item={item} />
          ))}
        </nav>

        <div className="border-t border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Appearance</p>
            <div className="flex gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  aria-pressed={theme === t.id}
                  title={`${t.label} - ${t.description}`}
                  className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    theme === t.id
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/50 dark:bg-indigo-500/15 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <span className="text-sm leading-none" aria-hidden="true">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`h-9 w-9 rounded-full bg-gradient-to-br ${avatarGradient(currentUser?.id)} flex items-center justify-center text-sm font-semibold text-white shadow-sm`}
            >
              {currentUser?.name?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{currentUser?.name}</p>
              {manager && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Reports to {manager.name}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/'
            }}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800 py-1.5 text-slate-700 dark:text-slate-200 hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-700 dark:hover:to-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <span aria-hidden="true">🏠</span>
            Back to Emami Apps
          </button>
        </div>
      </aside>
    </>
  )
}
