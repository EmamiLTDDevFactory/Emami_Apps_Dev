import { Routes, Route } from "react-router-dom";

import Dashboard from "../pages/Dashboard";
import AuditList from "../pages/AuditList";
import CreateAudit from "../pages/CreateAudit";
import CAPAManagement from "../pages/CAPAManagement";
import Reports from "../pages/Reports";
import Notifications from "../pages/Notifications";
import Annexure1 from "../pages/Annexure1";

import Layout from "../components/layout/Layout";
import RoleGuard from "../components/RoleGuard";

export default function AppRoutes() {
  return (
    <Routes>
      {/* No login route — Layout signs the user in from their Emami Apps session automatically. */}

      {/* Pages with Layout */}
      <Route element={<Layout />}>
        <Route
          path="/"
          element={<Dashboard />}
        />

        <Route
          path="/audits"
          element={<AuditList />}
        />

        <Route
          path="/audits/create"
          element={<CreateAudit />}
        />

        <Route
          path="/capa/:auditId"
          element={<CAPAManagement />}
        />

        {/* <Route
          path="/reports"
          element={<Reports />}
        /> */}

        <Route
          path="/reports"
          element={
            <RoleGuard role="CQA">
              <Reports />
            </RoleGuard>
          }
        />

        <Route
          path="/annexure1/:id"
          element={<Annexure1 />}
        />

        <Route
          path="/notifications"
          element={<Notifications />}
        />
      </Route>
    </Routes>
  );
}