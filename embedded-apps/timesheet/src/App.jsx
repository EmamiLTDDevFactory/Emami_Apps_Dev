import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MyTimesheet from './pages/MyTimesheet'
import TimesheetHistory from './pages/TimesheetHistory'
import TeamApprovals from './pages/TeamApprovals'
import TeamHistory from './pages/TeamHistory'
import ManageTeam from './pages/ManageTeam'
import TeamReports from './pages/TeamReports'

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  'my-timesheet': 'My Timesheet',
  history: 'My Timesheets History',
  'team-approvals': 'Team Approvals',
  'team-history': 'Team Timesheets History',
  'manage-team': 'Manage Team',
  'team-reports': 'Team Reports',
}

function AppShell() {
  const { isLoggedIn, currentUser, resetDemoData } = useApp()
  const [page, setPage] = useState('dashboard')
  const [pageParams, setPageParams] = useState({})
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setPage('dashboard')
    setPageParams({})
  }, [currentUser?.id])

  if (!isLoggedIn) return <Login />

  function navigate(nextPage, params = {}) {
    setPage(nextPage)
    setPageParams(params)
  }

  const isManager = currentUser.role === 'manager'
  let content
  switch (page) {
    case 'my-timesheet':
      content = <MyTimesheet navigate={navigate} monthParam={pageParams.month} />
      break
    case 'history':
      content = isManager ? <Dashboard navigate={navigate} /> : <TimesheetHistory navigate={navigate} />
      break
    case 'team-approvals':
      content = isManager ? (
        <TeamApprovals navigate={navigate} reviewUserId={pageParams.reviewUserId} reviewMonth={pageParams.reviewMonth} />
      ) : (
        <Dashboard navigate={navigate} />
      )
      break
    case 'team-history':
      content = isManager ? <TeamHistory navigate={navigate} /> : <Dashboard navigate={navigate} />
      break
    case 'manage-team':
      content = isManager ? <ManageTeam navigate={navigate} /> : <Dashboard navigate={navigate} />
      break
    case 'team-reports':
      content = isManager ? <TeamReports navigate={navigate} /> : <Dashboard navigate={navigate} />
      break
    case 'dashboard':
    default:
      content = <Dashboard navigate={navigate} />
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar page={page} onNavigate={navigate} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex-1 min-w-0">
        <header className="lg:hidden h-16 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            ☰
          </button>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{PAGE_TITLES[page]}</span>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">{content}</main>
        <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <button
            type="button"
            onClick={resetDemoData}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus-visible:underline"
          >
            Reset demo data
          </button>
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
