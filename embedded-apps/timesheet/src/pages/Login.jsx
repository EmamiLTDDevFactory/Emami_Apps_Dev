import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme, THEMES } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import emamiLogo from '../assets/emami-apps-logo.png'

export default function Login() {
  const { demoUsers, demoLogin, currentUserId } = useApp()
  const { theme, setTheme, isMinimal } = useTheme()
  const { showToast } = useToast()
  const [selected, setSelected] = useState(currentUserId || demoUsers[0]?.id)
  const [loggingIn, setLoggingIn] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selected) return
    setLoggingIn(true)
    try {
      await demoLogin(selected)
    } catch (err) {
      showToast(err.message || 'Could not log in.', 'error')
      setLoggingIn(false)
    }
  }

  const bgGradient = isMinimal
    ? 'bg-gradient-to-br from-indigo-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
    : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
  const btnGradient = isMinimal
    ? 'from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-indigo-200 dark:shadow-none focus-visible:ring-indigo-500'
    : 'from-blue-600 via-violet-600 to-purple-600 hover:from-blue-500 hover:via-violet-500 hover:to-purple-500 shadow-blue-200 dark:shadow-none focus-visible:ring-blue-500'
  const selectFocus = isMinimal ? 'focus:ring-indigo-500 focus:border-indigo-500' : 'focus:ring-blue-500 focus:border-blue-500'

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 relative overflow-hidden ${bgGradient}`}>
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-200/40 dark:bg-blue-500/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-200/40 dark:bg-purple-500/10 blur-3xl" aria-hidden="true" />
      {!isMinimal && (
        <>
          <div className="pointer-events-none absolute top-1/3 right-1/4 h-56 w-56 rounded-full bg-teal-200/30 dark:bg-teal-500/10 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute bottom-1/4 left-1/4 h-48 w-48 rounded-full bg-orange-200/25 dark:bg-orange-500/10 blur-3xl" aria-hidden="true" />
        </>
      )}

      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-8 shadow-xl shadow-blue-100 dark:shadow-none">
        <div className="flex flex-col items-center gap-2.5 mb-6">
          <img src={emamiLogo} alt="Emami Group" className="h-44 w-44 object-contain" />
          <span className="text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">TimeSheet</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="user-select" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Log in as
            </label>
            <select
              id="user-select"
              value={selected}
              disabled={loggingIn}
              onChange={(e) => setSelected(e.target.value)}
              className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 ${selectFocus}`}
            >
              {demoUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} - {u.role === 'manager' ? 'Manager' : 'Employee'}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loggingIn || !selected}
            className={`w-full rounded-lg bg-gradient-to-r px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${btnGradient}`}
          >
            {loggingIn ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          No password needed - this is a demo role switcher. Try a manager to see approvals &amp; team screens.
        </p>

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 text-center">Appearance</p>
          <div className="flex gap-1.5 justify-center">
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
      </div>
    </div>
  )
}
