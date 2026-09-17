import React, { useEffect, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import ComingSoon from '../shared/ComingSoon.jsx';
import { apiMe, getCurrentUserEmail, isDevTrackerAdmin } from '../shared/api.js';
import { StarBadgeIcon } from '../shared/icons.jsx';

export default function Evaluation() {
  const [profileName, setProfileName] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const email = getCurrentUserEmail();

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
    isDevTrackerAdmin(email).then(setIsAdmin);
    apiMe(email).then((data) => {
      if (data?.success && data.profile?.name) setProfileName(data.profile.name);
    });
  }, [email]);

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="evaluation" isAdmin={isAdmin} email={email} name={profileName} />
      <main className="shell-main">
        <ComingSoon
          icon={StarBadgeIcon}
          eyebrow="SAP Change & Development Log"
          title="Evaluation"
          description={
            isAdmin
              ? 'Score any consultant on a fixed scorecard — the same one they can fill out on themselves — and track how it changes over time.'
              : 'A structured self-evaluation: rate yourself on a fixed scorecard and add context in your own words. Your lead sees the same scorecard when reviewing you.'
          }
          bullets={[
            'Fixed scorecard: delivery quality, communication, technical depth, timeliness',
            'Self-evaluation, plus (for admins) evaluating any consultant on the same criteria',
            'A history of past evaluations per person, so scores are comparable over time',
          ]}
        />
      </main>
    </div>
  );
}
