import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'

const EMPLOYEE_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'my-timesheet', label: 'My Timesheet', icon: '🗓️' },
  { key: 'history', label: 'My Timesheets History', icon: '📜' },
]

const MANAGER_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'team-approvals', label: 'Team Approvals', icon: '✅' },
  { key: 'team-history', label: 'Team Timesheets History', icon: '📜' },
  { key: 'manage-team', label: 'Manage Team', icon: '👥' },
  { key: 'team-reports', label: 'Team Reports', icon: '📊' },
]

export default function TopNav({ page, onNavigate }) {
  const { currentUser } = useApp()
  const { isMinimal } = useTheme()
  const isManager = currentUser?.role === 'manager'
  const items = isManager ? MANAGER_ITEMS : EMPLOYEE_ITEMS
  const activeClasses = isMinimal
    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
    : 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200'

  return (
    <nav className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-6xl mx-auto flex items-center gap-1 px-4 sm:px-6 lg:px-8 overflow-x-auto">
        {items.map((item) => {
          const active = page === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${
                active
                  ? `border-current ${activeClasses}`
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
