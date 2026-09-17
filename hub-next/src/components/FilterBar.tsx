'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, Check, Lock, LayoutGrid, Landmark, Cog, Wallet, Grid3x3 } from 'lucide-react';
import { colors, fonts, fontWeights, radii, shadows, catColor } from '../theme/tokens';
import { CATEGORIES, APPS } from '../data/mockData';
import type { CategoryFilter, SortOption } from '../types';

const SORT_OPTIONS: SortOption[] = ['Alphabetical', 'Most Used', 'Recently Used'];

/** One icon per category tile — 'All' isn't a real category (see catColor's fallback-to-rust for
 * it too), so it gets a neutral catalog glyph rather than something that'd imply it's just another
 * segment. */
const CATEGORY_ICONS: Record<string, typeof LayoutGrid> = {
  All: LayoutGrid,
  Finance: Landmark,
  Operations: Cog,
  IBD: Wallet,
  General: Grid3x3,
};

interface FilterBarProps {
  category: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
  sort?: SortOption;
  onSortChange?: (s: SortOption) => void;
  /** The signed-in user's granted app ids (see useUnlockedAppIds) — a category tile whose apps are
   * ALL locked renders locked itself (dimmed, "Locked" badge) and isn't clickable, so someone
   * can't select a segregation that would only ever show them tiles they can't open anyway. 'All'
   * is exempt — it's the reset/overview state, not a real segregation, so it stays usable even if
   * every single app happens to be locked (that's exactly when someone most needs to see the full
   * catalog to know what to request access to). */
  unlockedAppIds: Set<string>;
  /** Hides the sort control — for a caller (Home) that renders these tiles purely as a
   * segregation picker with no app grid of its own to sort, `sort`/`onSortChange` are omitted
   * entirely rather than faked. */
  hideSort?: boolean;
}

export default function FilterBar({ category, onCategoryChange, sort, onSortChange, unlockedAppIds, hideSort }: FilterBarProps) {
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingRight: 8, flex: 1 }}>
        {CATEGORIES.map((c) => {
          const active = category === c;
          const Icon = CATEGORY_ICONS[c] || Grid3x3;
          const accent = catColor(c);
          const categoryApps = c === 'All' ? [] : APPS.filter((a) => a.cat === c);
          const locked = c !== 'All' && categoryApps.length > 0 && categoryApps.every((a) => !unlockedAppIds.has(a.id));
          return (
            <button
              key={c}
              type="button"
              onClick={() => !locked && onCategoryChange(c)}
              disabled={locked}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 5,
                flexShrink: 0,
                minWidth: 100,
                padding: '9px 14px',
                borderRadius: radii.lg,
                cursor: locked ? 'not-allowed' : 'pointer',
                border: locked ? `1px solid ${colors.border}` : active ? `1px solid ${accent}` : `1px solid ${colors.border}`,
                backgroundColor: locked ? colors.appBg : active ? `${accent}14` : colors.white,
                opacity: locked ? 0.6 : 1,
                boxShadow: active && !locked ? shadows.sm : 'none',
              }}
              aria-pressed={active}
              aria-disabled={locked}
              aria-label={locked ? `${c}, locked — no apps in this category yet` : c}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={14} color={locked ? colors.inkSoft : active ? accent : colors.inkSoft} />
                <span
                  style={{
                    fontSize: 12.5,
                    fontFamily: active ? fonts.sansBold : fonts.sansSemiBold,
                    fontWeight: active ? fontWeights.sansBold : fontWeights.sansSemiBold,
                    color: locked ? colors.inkSoft : active ? accent : colors.ink,
                  }}
                >
                  {c}
                </span>
              </span>
              {locked && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Lock size={8} color={colors.inkSoft} strokeWidth={2.4} />
                  <span style={{ fontSize: 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.inkSoft }}>
                    Locked
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!hideSort && onSortChange && (
        <>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            style={{
              width: 34,
              height: 34,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${colors.border}`,
              borderRadius: radii.sm + 1,
              backgroundColor: colors.white,
              cursor: 'pointer',
            }}
            aria-label={`Sort by, currently ${sort}`}
          >
            <SlidersHorizontal size={15} color={colors.inkSoft} />
          </button>

          {sortOpen && (
            <>
              <div
                onClick={() => setSortOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 40,
                  right: 0,
                  width: 200,
                  backgroundColor: colors.white,
                  borderRadius: radii.lg,
                  border: `1px solid ${colors.border}`,
                  boxShadow: shadows.xl,
                  overflow: 'hidden',
                  zIndex: 50,
                }}
              >
                <p style={{ fontSize: 11, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, padding: 14, margin: 0 }}>
                  Sort by
                </p>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onSortChange(opt);
                      setSortOpen(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 16px',
                      borderTop: `1px solid ${colors.border}`,
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 13.5,
                      fontFamily: fonts.sansMedium,
                      fontWeight: fontWeights.sansMedium,
                      color: colors.ink,
                    }}
                  >
                    {opt}
                    {sort === opt && <Check size={16} color={colors.rust} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
