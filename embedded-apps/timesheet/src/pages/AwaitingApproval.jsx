import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import PickManager from './PickManager'
import emamiLogo from '../assets/emami-apps-logo.png'

const POLL_MS = 8000

// Shown once an employee has picked a manager but that manager hasn't approved them yet (see
// App.jsx's render gate, keyed off currentUser.status/managerId). Polls quietly in the background
// so approval takes effect without the employee having to know to reload - the same "always
// re-verify" reasoning as AppContext's hub bootstrap, just on a shorter loop since there's no hub
// round-trip involved here.
export default function AwaitingApproval({ currentUser }) {
  const { getUserById, refreshUser } = useApp()
  const { isMinimal } = useTheme()
  const [checking, setChecking] = useState(false)
  const [pickingAgain, setPickingAgain] = useState(false)
  const manager = getUserById(currentUser.managerId)

  useEffect(() => {
    const id = setInterval(() => {
      refreshUser(currentUser.id).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(id)
  }, [currentUser.id, refreshUser])

  if (pickingAgain) return <PickManager changingFrom={manager} />

  const bgGradient = isMinimal
    ? 'bg-gradient-to-br from-indigo-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
    : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
  const linkColor = isMinimal
    ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
    : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'

  async function handleCheckNow() {
    setChecking(true)
    try {
      await refreshUser(currentUser.id)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 relative overflow-hidden ${bgGradient}`}>
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-8 shadow-xl shadow-blue-100 dark:shadow-none text-center">
        <div className="flex flex-col items-center gap-2.5 mb-4">
          <img src={emamiLogo} alt="Emami Group" className="h-28 w-28 object-contain" />
        </div>
        <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-transparent animate-spin" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">Waiting for approval</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          You asked to join <span className="font-medium text-slate-700 dark:text-slate-200">{manager?.name || 'your manager'}</span>'s
          team. You'll be able to use Timesheet as soon as they approve you - this page will move on by itself once that happens.
        </p>
        <button
          type="button"
          onClick={handleCheckNow}
          disabled={checking}
          className="mt-5 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
        <button
          type="button"
          onClick={() => setPickingAgain(true)}
          className={`mt-3 text-xs font-medium focus:outline-none focus-visible:underline ${linkColor}`}
        >
          Picked the wrong manager? Choose someone else.
        </button>
      </div>
    </div>
  )
}
