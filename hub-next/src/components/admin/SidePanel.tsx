'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { colors } from '../../theme/tokens';
import { ghostIconBtnStyle } from './adminShared';

/** Right-hand slide-over used for the user and app drill-downs — keeps the list behind it in view
 * (unlike a centred dialog) so an admin can work down a roster without losing their place.
 * Full-width on phones. Escape closes it. */
export default function SidePanel({
  onClose,
  header,
  footer,
  children,
  width = 560,
}: {
  onClose: () => void;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div className="ac-backdrop" onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(21,17,41,0.38)', backdropFilter: 'blur(2px)' }} />
      <aside
        className="ac-drawer"
        role="dialog"
        aria-modal="true"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `min(${width}px, 100vw)`, backgroundColor: colors.white, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px -12px rgba(21,17,41,0.28)' }}
      >
        <div style={{ position: 'relative', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          {header}
          <button type="button" className="ac-btn" onClick={onClose} style={{ ...ghostIconBtnStyle, position: 'absolute', top: 14, right: 14, backgroundColor: colors.white, border: `1px solid ${colors.border}` }} aria-label="Close">
            <X size={16} color={colors.inkSoft} />
          </button>
        </div>
        <div className="ac-scroll" style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ borderTop: `1px solid ${colors.border}`, padding: '12px 20px', flexShrink: 0, backgroundColor: '#FBFBFE' }}>{footer}</div>}
      </aside>
    </div>
  );
}

/** Underlined tab strip used inside a SidePanel header. */
export function PanelTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 22, padding: '0 20px', overflowX: 'auto' }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0 11px', borderBottom: `2px solid ${active ? colors.rust : 'transparent'}`, color: active ? colors.rust : colors.inkSoft, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-montserrat)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            {t.label}
            {t.count !== undefined && (
              <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 999, backgroundColor: active ? `${colors.rust}17` : '#EEF0F4', color: active ? colors.rust : colors.inkSoft }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
