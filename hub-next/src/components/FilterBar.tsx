'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, Check } from 'lucide-react';
import { colors, fonts, fontWeights, radii, shadows } from '../theme/tokens';
import { CATEGORIES } from '../data/mockData';
import type { CategoryFilter, SortOption } from '../types';

const SORT_OPTIONS: SortOption[] = ['Alphabetical', 'Most Used', 'Recently Used'];

interface FilterBarProps {
  category: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
}

export default function FilterBar({ category, onCategoryChange, sort, onSortChange }: FilterBarProps) {
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingRight: 8, flex: 1 }}>
        {CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onCategoryChange(c)}
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderRadius: radii.pill,
                fontSize: 12.5,
                fontFamily: fonts.sansSemiBold,
                fontWeight: fontWeights.sansSemiBold,
                cursor: 'pointer',
                border: active ? 'none' : `1px solid ${colors.border}`,
                backgroundColor: active ? colors.rust : colors.white,
                color: active ? colors.white : colors.inkSoft,
                boxShadow: active ? shadows.sm : 'none',
              }}
              aria-pressed={active}
            >
              {c}
            </button>
          );
        })}
      </div>

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
    </div>
  );
}
