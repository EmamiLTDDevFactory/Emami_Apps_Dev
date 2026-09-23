import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Onboarding from './pages/Onboarding';
import ConsultantDetail from './pages/ConsultantDetail';
import Closure from './pages/Closure';
import RoleMaintenance from './pages/RoleMaintenance';
import FileMaintenance from './pages/FileMaintenance';
import Login from './pages/Login';
import { getHubEmail, loginWithHubEmail } from './lib/hubEmailLogin';

/** Tries logging in via the email the EmamiApps hub already captured (same-origin localStorage)
 * before any route ever renders — skips the Employee ID + OTP screen entirely when it succeeds.
 * Only attempted when there's no existing session already, so it never overrides an active login.
 *
 * Also reports whether a hub email was found at all, via `hubEmailDetected` — App() uses that to
 * decide whether the old Employee ID + OTP screen should even be reachable (see the render guard
 * below). A hub email that fails to resolve in SAP is treated the same way Non CTC Expense's
 * equivalent case is: the visitor genuinely came from the hub, so they ARE signed in — SAP simply
 * has no record for their email. Sending them back to the Emami Apps dashboard is correct there;
 * showing them a login form with nothing useful to type is not. */
function useHubEmailBootstrap() {
  const [ready, setReady] = useState(false);
  const [hubEmailDetected, setHubEmailDetected] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('isAuthenticated') === 'true') {
      setReady(true);
      return;
    }

    const hubEmail = getHubEmail();
    if (!hubEmail) {
      setReady(true);
      return;
    }

    setHubEmailDetected(true);

    let cancelled = false;
    loginWithHubEmail(hubEmail).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        sessionStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('employeeId', result.loginId);
        if (result.name) localStorage.setItem('employeeName', result.name);
        if (result.role) localStorage.setItem('employeeRole', result.role);
        localStorage.setItem('employeeTa', result.ta || '');
        localStorage.setItem('employeeTm', result.tm || '');
        localStorage.setItem('employeeLd', result.ld || '');
        localStorage.setItem('employeeOd', result.od || '');
        setReady(true);
      } else {
        console.warn('[hub-email-login] Hub email did not resolve in SAP:', result.error);
        window.location.href = '/';
        // Deliberately no setReady(true) here — the full-page navigation above supersedes
        // whatever would otherwise render next, same reasoning as Non CTC Expense's AuthContext.
      }
    });

    return () => { cancelled = true; };
  }, []);

  return { ready, hubEmailDetected };
}

/** Browser Back should always exit cleanly to the EmamiApps hub Dashboard once there's no more
 * in-app history to go back to — never fall through to whatever entry happens to be sitting
 * behind this app's own screens. React Router doesn't expose a canGoBack() like Expo Router does,
 * so this tracks in-app navigation depth manually: every real route change (after the first)
 * increments it, every Back press decrements it — only when depth is already at 0 (nothing left
 * to go back to inside the app) does Back get redirected to the hub instead. Every other Back
 * press (real in-app history, e.g. leaving a consultant detail page) is untouched. */
function useExitToHubOnBack() {
  const location = useLocation();
  const isFirstRender = useRef(true);
  const depthRef = useRef(0);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    depthRef.current += 1;
  }, [location]);

  // Final safety net: plant one extra same-document history entry the moment this app loads.
  // Without it, if a long browsing session has already used up whatever real pages existed
  // before this one, the very first Back press can jump straight past our app to a browser-
  // internal page (e.g. Chrome's own blank/Incognito page) — our JS is torn down as part of that
  // navigation and never gets a chance to run, so it can't redirect anywhere. This anchor entry
  // duplicates the current URL once, so that first Back press always resolves within our own
  // page instead (same URL, no reload), where the popstate handler below is guaranteed to run.
  useEffect(() => {
    window.history.pushState(window.history.state, '', window.location.href);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (depthRef.current <= 0) {
        window.location.replace('/');
      } else {
        depthRef.current -= 1;
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}

const ProtectedRoute = () => {
  const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) return;

    // Timeout duration: 15 minutes of inactivity (standard enterprise security policy)
    // 15 minutes = 15 * 60 * 1000 = 900,000 milliseconds
    const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
    let timeoutId;

    const handleSessionTimeout = () => {
      // Clear session authentication flags
      sessionStorage.clear();
      localStorage.removeItem('employeeId');
      localStorage.removeItem('employeeRole');
      localStorage.removeItem('employeeTa');
      localStorage.removeItem('employeeTm');
      localStorage.removeItem('employeeLd');
      localStorage.removeItem('employeeOd');

      alert("Your session has expired due to inactivity. Please log in again.");
      window.location.href = "/apps/rc-portal/login";
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleSessionTimeout, INACTIVITY_TIMEOUT);
    };

    // Listen for standard user interaction events
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Initialize timer
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

const PublicRoute = ({ children }) => {
  const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppLayout = () => (
  <Layout>
    <Outlet />
  </Layout>
);

export default function App() {
  const { ready: bootstrapped, hubEmailDetected } = useHubEmailBootstrap();
  useExitToHubOnBack();

  if (!bootstrapped) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-lg border border-slate-200">
          <Loader2 className="h-8 w-8 animate-spin text-rc-teal" />
          <span className="text-sm font-medium text-slate-600">Loading...</span>
        </div>
      </div>
    );
  }

  // Real deployment, but this browser never went through the hub at all (no hub email found) —
  // most likely someone opened this URL directly (e.g. a shared link) instead of through the hub.
  // The Employee ID + OTP screen is legacy from before the hub/Microsoft-SSO integration and
  // shouldn't be reachable here anymore — send them to sign in through the hub instead, same
  // guard every other embedded app in this repo already has (see Timesheet's AppContext.jsx).
  // Skipped entirely in standalone local dev, where there's no hub around this app at all.
  const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
  if (!import.meta.env.DEV && !hubEmailDetected && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="max-w-sm w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Sign in through Emami Apps</p>
          <p className="mt-1 text-sm text-slate-500">
            This page isn't reachable directly — open the Resource &amp; Consultant Portal from the Emami Apps hub instead.
          </p>
          <a
            href="/"
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-rc-teal px-4 py-2 text-sm font-semibold text-white hover:bg-rc-teal-dark"
          >
            Back to Emami Apps
          </a>
        </div>
      </div>
    );
  }

  return (
    <AppProvider>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/consultants" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/consultants/:consultantId" element={<ConsultantDetail />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/onboarding/:consultantId/edit" element={<Onboarding />} />
            <Route path="/roles" element={<RoleMaintenance />} />
            <Route path="/files" element={<FileMaintenance />} />
            <Route path="/closure/:consultantId" element={<Closure />} />
            <Route path="/closure/:consultantId/:closureId" element={<Closure />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </AppProvider>
  );
}

