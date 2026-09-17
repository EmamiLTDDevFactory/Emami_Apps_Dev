import React, { useEffect, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import ComingSoon from '../shared/ComingSoon.jsx';
import { apiMe, getCurrentUserEmail, isDevTrackerAdmin } from '../shared/api.js';
import { ShieldIcon } from '../shared/icons.jsx';
import { ROUTES } from '../shared/routes.js';

export default function QaSupport() {
  const [access, setAccess] = useState('checking'); // checking | denied | allowed
  const [profileName, setProfileName] = useState(null);
  const email = getCurrentUserEmail();

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
    isDevTrackerAdmin(email).then((ok) => {
      if (!ok) window.location.href = ROUTES.home;
      else setAccess('allowed');
    });
    apiMe(email).then((data) => {
      if (data?.success && data.profile?.name) setProfileName(data.profile.name);
    });
  }, [email]);

  if (access !== 'allowed') {
    return <div className="empty-state">Checking access…</div>;
  }

  return (
    <div className="app-shell">
      <Sidebar active="qaSupport" isAdmin email={email} name={profileName} />
      <main className="shell-main">
        <ComingSoon
          icon={ShieldIcon}
          tone="teal"
          eyebrow="SAP Change & Development Log"
          title="QA Support"
          description="A dedicated space for QA to review in-flight items, flag test gaps, and log defects straight against the item they affect — without leaving Dev Tracker."
          bullets={[
            'Defect log linked to a Dev Tracker item, visible on that item’s timeline',
            'QA sign-off status per stage (IT Testing, User Testing) before it can move on',
            'A queue of items awaiting QA review, filterable by module and priority',
          ]}
        />
      </main>
    </div>
  );
}
