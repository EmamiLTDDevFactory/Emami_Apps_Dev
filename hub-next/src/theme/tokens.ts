// "Emami HUB" design tokens — shared across the whole app.

export const colors = {
  amber: '#F5A623', // reserved for the favorite star / "most used" accent only
  rust: '#4F3FD6', // primary indigo accent — buttons, active states, links
  rustDeep: '#3B2FB0', // deeper indigo — gradient stop, pressed states
  plum: '#241E3D', // deep indigo — dark surfaces (stack header, solid buttons)
  plumDeep: '#151129', // darkest indigo — gradient stops, text on light accents
  cream: '#F6F4FD', // near-white lavender tint
  cream2: '#F3F1FB', // page background
  ink: '#1F1B33', // primary text
  inkSoft: '#6B7280', // secondary/gray text
  border: '#E6E3F5', // hairline borders
  white: '#FFFFFF',
  green: '#1F7A4D',
  greenTint: '#1F7A4D17',
  greenBorder: '#1F7A4D33',
  // UAT stage badge — a darker amber than `amber`, which stays reserved for favorites/most used.
  uat: '#B45309',
  uatTint: '#B4530917',
  uatBorder: '#B4530933',
  // Hub-shell-only tokens (post-login screens). Deliberately separate from
  // cream2/plum above, which stay reserved for the Login screen's look —
  // changing these never touches Login.
  appBg: '#EEF0F4', // cool neutral page background, not lavender-tinted
  sidebar: '#FFFFFF', // white sidebar — flat, no gradient
  sidebarBorder: '#E6E3F5',
  sidebarText: '#1F1B33', // dark ink — readable on white
  sidebarTextSoft: '#6B7280',
  sidebarActive: '#4F3FD614', // light brand-accent tint for the active row
} as const;

// The one signature accent gradient — used sparingly on primary actions and
// the active nav state only. Not the login page's rainbow; a single hue
// family (indigo -> violet) so it reads as a brand accent, not decoration.
export const gradients = {
  primary: ['#6D5BF5', colors.rust, colors.rustDeep] as const,
};

// Each category's icon color, sampled from the matching Emami Analytics hub module (see
// data/categoryMeta.ts for which module each category borrows). Icon chips render these at a
// light tint (see categoryTint) with the icon at full hue.
export const categoryColors: Record<string, string> = {
  Finance: '#8B3DF0', // F & A
  SD: '#3355E0', // Sales
  IBD: '#C2336B',
  'Supply Chain': '#4A9BF0',
  CPD: '#F0922E',
  HR: '#4A5AE0',
  IT: '#4A5AE0',
  'Cross-Function': '#3A8AAE', // Operations
  CQA: '#3BA36E', // R&D
  Packaging: '#3AA389', // Subsidiary & D2C
  MSD: '#EE9A2E', // CMI
} as const;

// Distinct pastel accent per real app, so the 4 cards read like the
// reference dashboard's category grid instead of only 2 repeated hues.
export const appAccents: Record<string, string> = {
  expense: '#0D9488', // Non CTC Expense — teal
  finance: '#5B4FE0', // RC Portal — indigo
  hr: '#EA580C', // Dispatch Tracker — orange
  inventory: '#DB2777', // MoldHealthCheck — pink
};

export function catColor(cat: string) {
  return categoryColors[cat] ?? colors.rust;
}

/** The pale background behind a category/nav icon — the accent at ~9% opacity, so every chip
 * reads as the same pastel family as the reference home screen. */
export function categoryTint(accent: string) {
  return `${accent}17`;
}

export function appColor(id: string) {
  return appAccents[id] ?? colors.rust;
}

// Per-nav-item accent, one hue per row in the sidebar (see Sidebar.tsx) — every icon there is
// color-coded now, the same treatment the Categories section already had, rather than only
// Categories being in color and everything else a flat gray.
export const navColors: Record<string, string> = {
  Home: colors.rust,
  MyApplications: '#0EA5E9',
  Favorites: colors.amber,
  People: '#0D9488',
  AccessRequests: '#7C3AED',
  Help: '#16A34A',
  Settings: '#F59E0B',
  UserAccess: '#E11D48',
  Administration: '#9333EA',
};

export function navColor(id: string) {
  return navColors[id] ?? colors.rust;
}

export const fonts = {
  sansRegular: 'var(--font-montserrat)',
  sansMedium: 'var(--font-montserrat)',
  sansSemiBold: 'var(--font-montserrat)',
  sansBold: 'var(--font-montserrat)',
  serifMedium: 'var(--font-montserrat)',
  serifSemiBold: 'var(--font-montserrat)',
} as const;

// Font WEIGHTS to pair with the family tokens above — react-native-web had a
// distinct font family per weight; the web build uses next/font's variable
// font family plus an explicit weight instead.
export const fontWeights = {
  sansRegular: 400,
  sansMedium: 500,
  sansSemiBold: 600,
  sansBold: 700,
  serifMedium: 500,
  serifSemiBold: 600,
} as const;

export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  xxxl: 18,
  pill: 999,
};

export const spacing = (n: number) => n * 4;

// Consistent shadow presets, tinted with the brand's deep indigo (plumDeep)
// rather than neutral black — matches the precedent already set by
// DashboardHero/LoginScreen. Use these instead of ad hoc shadow objects.
export const shadows = {
  none: 'none',
  sm: `0 1px 4px 0 ${colors.plumDeep}14`,
  md: `0 4px 10px 0 ${colors.plumDeep}1a`,
  lg: `0 10px 20px 0 ${colors.plumDeep}24`,
  xl: `0 16px 30px 0 ${colors.plumDeep}2e`,
} as const;

// Motion tokens for the few components that animate (press/hover feedback).
// Keep durations short — this is feedback, not decoration.
export const motion = {
  duration: { fast: 120, base: 180, slow: 240 },
  // A gentle deceleration curve (ease-out-quart-ish) — used in place of plain
  // "ease-out" wherever a hover/press transition should feel like it settles
  // rather than stops abruptly.
  easeSmooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  pressScale: 0.97,
  hoverScale: 1.02,
  hoverLift: -2, // translateY on hover, subtle lift
  // Perspective tilt (see useTiltHover) — a tile rotates toward the cursor on
  // hover for a subtle 3D feel, then eases flat again on mouse-leave.
  tiltPerspective: 700,
  tiltMaxDeg: 8,
} as const;

// Named type scale — collapses the many near-duplicate inline font sizes
// (9, 10.5, 11, 11.5, 12, 12.5...) used across the app into a shared scale.
// Only newly-touched styles adopt this; existing hand-tuned literals
// elsewhere are left alone to avoid unrelated visual drift.
export const type = {
  xs: 10.5,
  sm: 12,
  base: 13.5,
  md: 14.5,
  lg: 16,
  xl: 18,
  xxl: 22,
  display: 46,
} as const;

// Keyboard focus ring (indigo, matches the brand accent). Spread into an
// element's style only when `focused` is true.
export const focusRing = {
  outline: `2px solid ${colors.rust}`,
  outlineOffset: 2,
} as const;
