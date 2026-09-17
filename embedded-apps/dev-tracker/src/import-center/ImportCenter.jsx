import React, { useEffect, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import ComingSoon from '../shared/ComingSoon.jsx';
import { apiMe, getCurrentUserEmail, isDevTrackerAdmin } from '../shared/api.js';
import { UploadCloudIcon } from '../shared/icons.jsx';
import { ROUTES } from '../shared/routes.js';

export default function ImportCenter() {
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
      <Sidebar active="importCenter" isAdmin email={email} name={profileName} />
      <main className="shell-main">
        <ComingSoon
          icon={UploadCloudIcon}
          tone="amber"
          eyebrow="SAP Change & Development Log"
          title="Import Center"
          description="Bulk-load cutover data straight into Dev Tracker — bring an existing tracker sheet in as a batch of items instead of entering each one by hand."
          bullets={[
            'Upload a spreadsheet, map its columns to Dev Tracker fields',
            'Preview and validate rows before anything is committed',
            'Every import logged, so a bad batch can be traced and reversed',
          ]}
        />
      </main>
    </div>
  );
}
