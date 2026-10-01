import React from 'react';

/** Same props as a lucide-react icon, so these custom glyphs drop in anywhere a LucideIcon does
 * (`<Icon size color strokeWidth />`). */
export interface CategoryIconProps {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  style?: React.CSSProperties;
}

export type CategoryIcon = React.ComponentType<CategoryIconProps>;

function Svg({ size = 24, color = 'currentColor', strokeWidth = 1.5, style, children }: CategoryIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Line-art redraws of the Emami Analytics hub's own module icons that aren't stock lucide glyphs
// (F & A, Supply Chain, CMI, CPD, Operations). Single stroke color, same as the stock ones, so
// every chip reads as one icon family.

/** F & A — a stack of coins with a rupee coin in front. */
export function CoinsRupeeIcon(props: CategoryIconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="8.5" cy="4.8" rx="5.5" ry="2.2" />
      <path d="M3 4.8v10.4c0 1.2 2.5 2.2 5.5 2.2" />
      <path d="M14 4.8v3.6" />
      <path d="M3 8.3c0 1.2 2.5 2.2 5.5 2.2 1.1 0 2.2-.1 3-.4" />
      <path d="M3 11.8c0 1.2 2.5 2.2 5.5 2.2" />
      <circle cx="16.2" cy="15.8" r="5.6" />
      <path d="M14 13h4.4M14 14.8h4.4M14.8 13c1.6 0 2.5.7 2.5 1.8s-1 1.8-2.5 1.8h-.8l3 3" />
    </Svg>
  );
}

/** Supply Chain — a moving truck under a dotted route linking three location pins. */
export function TruckRouteIcon(props: CategoryIconProps) {
  const pin = (x: number, y: number) => `M${x} ${y + 3.4}s-1.7-1.6-1.7-2.9a1.7 1.7 0 0 1 3.4 0c0 1.3-1.7 2.9-1.7 2.9z`;
  return (
    <Svg {...props}>
      <path d={pin(12, 0.9)} />
      <path d={pin(3.6, 5)} />
      <path d={pin(20.4, 5)} />
      <path d="M5.2 5.6C6.9 3.9 8.4 3 9.9 2.6M14.1 2.6c1.5.4 3 1.3 4.7 3" strokeDasharray="0.3 1.7" />
      <path d="M6.5 10.8h8.5v7H6.5z" />
      <path d="M15 12.8h3.6l2.9 3v2H15" />
      <circle cx="9.3" cy="19.4" r="1.5" />
      <circle cx="18" cy="19.4" r="1.5" />
      <path d="M1.5 12.8h3.2M1 15.2h3.7M2.6 17.6h2.2" />
    </Svg>
  );
}

/** CMI — an analyst beside a speech bubble and a rising bar chart. */
export function AnalystChartIcon(props: CategoryIconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="10.6" r="3" />
      <path d="M1.5 21.6c0-3.3 2.4-5.6 5.5-5.6s5.5 2.3 5.5 5.6z" />
      <path d="M13.5 1.8h7a1.6 1.6 0 0 1 1.6 1.6v3.8a1.6 1.6 0 0 1-1.6 1.6h-4.3l-2.2 2V8.8h-.5a1.6 1.6 0 0 1-1.6-1.6V3.4a1.6 1.6 0 0 1 1.6-1.6z" />
      <path d="M14.6 4.4h5M14.6 6.4h3" />
      <path d="M14 16.6h1.8v5H14zM17.3 14.2h1.8v7.4h-1.8zM20.6 11.8h1.8v9.8h-1.8z" />
    </Svg>
  );
}

/** CPD — a trolley carrying a document with boxes on it, and a gear beside it. */
export function TrolleyGearIcon(props: CategoryIconProps) {
  const cx = 19.4;
  const cy = 11.4;
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const p = (r: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
    return `M${p(2.6)}L${p(3.6)}`;
  }).join('');
  return (
    <Svg {...props}>
      <rect x="6.8" y="1.4" width="8.4" height="11.4" rx="1.3" />
      <path d="M9.2 4.2h3.6M9.2 6.4h3.6" />
      <path d="M8.4 9h2.6v2.2H8.4zM11 9h2.6v2.2H11z" />
      <path d="M1.5 9.5h1.9l2 9h9.8l1.2-3.8" />
      <circle cx="7.2" cy="21" r="1.3" />
      <circle cx="13.6" cy="21" r="1.3" />
      <circle cx={cx} cy={cy} r="2.6" />
      <circle cx={cx} cy={cy} r="1" />
      <path d={teeth} />
    </Svg>
  );
}

/** Operations — two nodes joined by an elbow connector. */
export function NodeConnectorIcon(props: CategoryIconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4" width="5" height="5" rx="1" />
      <rect x="15.5" y="15" width="5" height="5" rx="1" />
      <path d="M8.5 6.5h7a2.5 2.5 0 0 1 2.5 2.5v6" />
    </Svg>
  );
}

/** Subsidiary & D2C — a shopping cart with round wheels joined by a short axle dash. */
export function CartIcon(props: CategoryIconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 3h2.6l2.6 11.6h12.2l2.1-8.6H5" />
      <circle cx="8.3" cy="19.4" r="1.7" />
      <circle cx="17.2" cy="19.4" r="1.7" />
      <path d="M11 19.4h3.5" />
    </Svg>
  );
}
