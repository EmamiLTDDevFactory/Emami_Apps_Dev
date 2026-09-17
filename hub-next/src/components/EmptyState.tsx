import React from 'react';
import { Inbox } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';

interface EmptyStateProps {
  query?: string;
}

export default function EmptyState({ query }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '72px 24px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: radii.pill,
          backgroundColor: colors.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <Inbox size={24} color={colors.rust} />
      </div>
      <p style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, marginBottom: 6 }}>
        No applications found
      </p>
      <p style={{ fontSize: 13.5, color: colors.inkSoft, fontFamily: fonts.sansRegular, textAlign: 'center', maxWidth: 300, lineHeight: '19px', margin: 0 }}>
        {query ? `Nothing matches "${query}". Try a different name or clear the filters.` : 'Try adjusting your filters or search terms.'}
      </p>
    </div>
  );
}
