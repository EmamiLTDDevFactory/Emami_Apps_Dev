import { useApp } from '../context/AppContext'
import emamiLogo from '../assets/emami-logo.png'

// Reached only when the hub identity in AppContext.jsx didn't resolve to a signed-in Timesheet
// user - either this page was opened outside the Emami Apps hub, or the hub session is valid but
// Manage Access has no "Admin"/"User" grant for the 'timesheet' app on this email. There is no
// form here: Timesheet has no login of its own, identity AND role come entirely from the hub.
export default function Login() {
  const { hubEmail, loggedIntoHub, accessDenied } = useApp()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" aria-hidden="true" />

      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/70 bg-white/90 backdrop-blur p-8 shadow-xl shadow-indigo-100 text-center">
        <div className="flex flex-col items-center gap-2.5 mb-6">
          <img src={emamiLogo} alt="Emami Group" className="h-44 w-44 object-contain" />
          <span className="text-lg font-bold text-slate-900 tracking-tight">TimeSheet</span>
        </div>

        {loggedIntoHub && accessDenied ? (
          <>
            <p className="text-sm font-semibold text-slate-800">No Timesheet access yet</p>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{hubEmail}</span> is signed in to Emami Apps, but Timesheet
              hasn't been granted to this email in Manage Access. Ask your hub admin to grant "Admin" (manager) or
              "User" (employee) access there.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">Sign in through Emami Apps</p>
            <p className="mt-2 text-sm text-slate-500">
              This page isn't reachable directly - open Timesheet from the Emami Apps hub instead.
            </p>
          </>
        )}

        <a
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:shadow-lg hover:from-indigo-500 hover:to-violet-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Back to Emami Apps
        </a>
      </div>
    </div>
  )
}
