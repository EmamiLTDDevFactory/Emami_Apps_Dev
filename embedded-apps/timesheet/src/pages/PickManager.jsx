import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import emamiLogo from '../assets/emami-apps-logo.png'

// Shown to a brand-new employee (or one whose manager just rejected them) before they can do
// anything else in Timesheet - see AppContext.jsx's status field and App.jsx's render gate.
// Picking someone here doesn't attach them right away; it just moves them to AwaitingApproval.jsx
// to wait for that manager's yes/no.
export default function PickManager({ changingFrom }) {
  const { fetchManagers, requestManager } = useApp()
  const { isMinimal } = useTheme()
  const { showToast } = useToast()
  const [managers, setManagers] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    fetchManagers()
      .then(setManagers)
      .catch((err) => setLoadError(err.message || 'Could not load the list of managers.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bgGradient = isMinimal
    ? 'bg-gradient-to-br from-indigo-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
    : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'
  const btnGradient = isMinimal
    ? 'from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-indigo-200 dark:shadow-none focus-visible:ring-indigo-500'
    : 'from-blue-600 via-violet-600 to-purple-600 hover:from-blue-500 hover:via-violet-500 hover:to-purple-500 shadow-blue-200 dark:shadow-none focus-visible:ring-blue-500'
  const selectFocus = isMinimal ? 'focus:ring-indigo-500 focus:border-indigo-500' : 'focus:ring-blue-500 focus:border-blue-500'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedId) return
    setSubmitting(true)
    try {
      await requestManager(selectedId)
    } catch (err) {
      showToast(err.message || 'Could not send that request.', 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 relative overflow-hidden ${bgGradient}`}>
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-8 shadow-xl shadow-blue-100 dark:shadow-none">
        <div className="flex flex-col items-center gap-2.5 mb-6">
          <img src={emamiLogo} alt="Emami Group" className="h-32 w-32 object-contain" />
          <span className="text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            {changingFrom ? 'Pick someone else' : "Who's your reporting manager?"}
          </span>
          <p className="text-sm text-center text-slate-500 dark:text-slate-400">
            {changingFrom
              ? "Choose the manager you actually report to - they'll get your request to approve."
              : "Choose your manager below. They'll need to approve you before you can start logging hours."}
          </p>
        </div>

        {loadError && (
          <p className="mb-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg px-3 py-2">
            {loadError}
          </p>
        )}

        {!loadError && managers && managers.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            No managers have been set up in Timesheet yet. Check back once one has.
          </p>
        )}

        {!loadError && managers && managers.length > 0 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="manager-select" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Reporting manager
              </label>
              <select
                id="manager-select"
                value={selectedId}
                disabled={submitting}
                onChange={(e) => setSelectedId(e.target.value)}
                className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 ${selectFocus}`}
              >
                <option value="" disabled>
                  Select a manager…
                </option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting || !selectedId}
              className={`w-full rounded-lg bg-gradient-to-r px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${btnGradient}`}
            >
              {submitting ? 'Sending request…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
