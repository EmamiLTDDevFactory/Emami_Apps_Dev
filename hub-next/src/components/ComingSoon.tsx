import React from 'react';
import { colors, fonts, fontWeights } from '../theme/tokens';

/** Placeholder for a screen not yet ported from the React Native hub in this increment — see the
 * conversion plan: Login/Home/My Applications/Favorites/App Detail shipped first since they cover
 * the core auth + navigation + catalog flow; Recent, Help, Settings, Manage Access, Configure SSO
 * and Administration follow in later increments. */
export default function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 20, color: colors.ink, margin: 0 }}>{title}</p>
      <p style={{ fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, marginTop: 8, maxWidth: 360 }}>
        This screen hasn&apos;t been converted to Next.js yet — it&apos;s coming in a later increment of the hub rewrite.
      </p>
    </div>
  );
}
