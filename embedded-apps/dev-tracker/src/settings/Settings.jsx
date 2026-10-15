import React, { useEffect, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import ComingSoon from '../shared/ComingSoon.jsx';
import { apiMe, apiAccessMe, getCurrentUserEmail } from '../shared/api.js';
import { SettingsIcon } from '../shared/icons.jsx';

export default function Settings() {
  const [profileName, setProfileName] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const email = getCurrentUserEmail();

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
    apiAccessMe(email).then((data) => {
      const role = data?.success ? data.apps?.find((a) => a.appId === 'dev-tracker')?.role : null;
      setIsAdmin(role === 'Admin');
    });
    apiMe(email).then((data) => {
      if (data?.success && data.profile?.name) setProfileName(data.profile.name);
    });
  }, [email]);

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="settings" isAdmin={isAdmin} email={email} name={profileName} />
      <main className="shell-main">
        <ComingSoon
          icon={SettingsIcon}
          tone="teal"
          eyebrow="Change Control Board & CR Tracker Log"
          title="Settings"
          description="Personal preferences for how Dev Tracker works for you — notifications, defaults, and display options."
          bullets={[
            'Notification preferences (email digest, in-app alerts)',
            'Default module/area filter for your Dashboard view',
            'Display density and theme',
          ]}
        />
      </main>
    </div>
  );
}
