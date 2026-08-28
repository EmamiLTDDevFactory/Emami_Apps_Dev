import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
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
 * Falls back to the normal login screen, unchanged, if there's no hub email or the SAP call
 * fails — see src/lib/hubEmailLogin.js. */
function useHubEmailBootstrap() {
  const [ready, setReady] = useState(false);

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
      } else {
        console.warn('[hub-email-login] Falling back to manual login:', result.error);
      }
      setReady(true);
    });

    return () => { cancelled = true; };
  }, []);

  return ready;
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
  const bootstrapped = useHubEmailBootstrap();
  useExitToHubOnBack();

  if (!bootstrapped) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/90 px-6 py-5 shadow-xl">
          <Loader2 className="h-8 w-8 animate-spin text-rc-teal" />
          <span className="text-sm font-medium text-slate-600">Loading...</span>
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

