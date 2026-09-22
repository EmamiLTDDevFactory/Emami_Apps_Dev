import React from 'react';
import { colors, radii } from '../theme/tokens';

/** Shared backdrop + card wrapper for every popup in Manage Access and Administration. `children`
 * renders inside a scrollable body (maxHeight capped, overflowY auto) so a tall dialog — many app
 * chips, a long user-detail breakdown — scrolls within the popup instead of overflowing off the
 * bottom of the screen with no way to reach what's cut off. */
export default function Dialog({ onClose, maxWidth = 440, children }: { onClose: () => void; maxWidth?: number; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(31,27,51,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth, maxHeight: '85vh', overflowY: 'auto', borderRadius: radii.xl, backgroundColor: colors.white, padding: 20 }}>
        {children}
      </div>
    </div>
  );
}
