import {
  Car,
  FileQuestion,
  HeartPulse,
  LucideIcon,
  Plane,
  Receipt,
  Shirt,
  Tag,
  Utensils,
  Wallet,
} from 'lucide-react';

// Expense-category cards (Approvals/Finance history, grouped by SAP's Setname/Descript) get a
// distinct pastel background + icon per category, matching the app's existing bottom-nav tile
// style. Categories are open-ended (whatever SAP returns) so this is keyword-matched against known
// names first, falling back to a stable hash-based pick so any unrecognized category still gets a
// consistent, pleasant color/icon instead of looking plain — same label always gets the same
// result, not random per render.
interface CategoryStyle {
  bg: string;
  text: string;
  icon: LucideIcon;
}

const PALETTE: Omit<CategoryStyle, 'icon'>[] = [
  { bg: 'bg-blueBg', text: 'text-blue' },
  { bg: 'bg-greenBg', text: 'text-green' },
  { bg: 'bg-amberBg', text: 'text-amber' },
  { bg: 'bg-redBg', text: 'text-red' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
];

const FALLBACK_ICONS = [Wallet, Receipt, Tag];

const KEYWORD_ICONS: [RegExp, LucideIcon][] = [
  [/convey|travel|transport|fuel|mileage|cab|taxi/i, Car],
  [/welfare|medical|health|insurance|hr\b/i, HeartPulse],
  [/food|meal|refresh|lunch|dinner|snack/i, Utensils],
  [/dress|uniform|cloth|apparel/i, Shirt],
  [/flight|air\b|trip/i, Plane],
  [/other|misc|general/i, FileQuestion],
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
};

export const getCategoryStyle = (label: string): CategoryStyle => {
  const normalized = label || 'Other';
  const keywordMatch = KEYWORD_ICONS.find(([pattern]) => pattern.test(normalized));
  const hash = hashString(normalized);
  const icon = keywordMatch ? keywordMatch[1] : FALLBACK_ICONS[hash % FALLBACK_ICONS.length];
  const palette = PALETTE[hash % PALETTE.length];
  return { ...palette, icon };
};
