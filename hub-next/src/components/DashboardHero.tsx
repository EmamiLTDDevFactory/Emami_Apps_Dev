import React, { useEffect, useState } from 'react';
import { colors, fonts, fontWeights } from '../theme/tokens';
import WeatherWidget from './WeatherWidget';

interface DashboardHeroProps {
  name: string;
}

// A flat utility page header, not a marketing hero — no gradient band, no second search box
// (Header already has the one working search input). Kept deliberately compact (small
// greeting, tight padding) — the app grid below is the actual point of the page, and this
// shouldn't push it below the fold. Last-login used to show here too; dropped per instruction
// (it's still on the Profile page) so this takes even less vertical space.
// Uses the viewer's own device clock. Midnight-5am needs its own bucket — a plain `hour < 12`
// check greeted anyone online past midnight with "Good Morning".
function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 21) return 'Good Evening';
  return 'Good Night';
}

export default function DashboardHero({ name }: DashboardHeroProps) {
  const [hour, setHour] = useState(() => new Date().getHours());

  // Home stays mounted for hours in a pinned/installed window — re-check each minute so the
  // greeting rolls over (e.g. Afternoon -> Evening) without a reload.
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const greeting = greetingFor(hour);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingBottom: 10,
        marginBottom: 10,
        borderBottom: `1px solid ${colors.border}`,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 16, color: colors.ink, margin: 0 }}>
          {greeting}, {name}
        </p>
      </div>
      <WeatherWidget />
    </div>
  );
}
