// Plain-value mirror of the hub's own src/theme/tokens.ts (Expo/React Native — can't be imported
// directly from a Next.js app), for anywhere a raw value is needed outside Tailwind classes (e.g.
// canvas/SVG chart fills, inline styles). Tailwind classes should use tailwind.config.ts's
// extended colors instead of these strings directly where a class will do.
export const colors = {
  rust: '#4F3FD6',
  rustDeep: '#3B2FB0',
  rustLight: '#6D5BF5',
  plum: '#241E3D',
  plumDeep: '#151129',
  ink: '#1F1B33',
  inkSoft: '#6B7280',
  border: '#E6E3F5',
  appBg: '#EEF0F4',
  cream: '#F6F4FD',
  white: '#FFFFFF',
  green: '#1F7A4D',
  greenBg: '#E7F5EC',
  red: '#C0392B',
  redBg: '#FBEAE8',
  amber: '#B45309',
  amberBg: '#FDF3E3',
  blue: '#1D6FA5',
  blueBg: '#E7F1F8',
  teal: '#0F766E',
  tealBg: '#E5F5F3',
} as const;

/** Chart series colors — used by Team Reports' bars, cycled per-item. */
export const chartPalette = [colors.rust, colors.teal, colors.amber, colors.blue, colors.rustLight, colors.green] as const;

export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  xxxl: 18,
  pill: 999,
} as const;
