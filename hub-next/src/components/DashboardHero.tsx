import React from 'react';
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
export default function DashboardHero({ name }: DashboardHeroProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

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
