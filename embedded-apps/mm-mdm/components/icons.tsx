import { SVGProps } from 'react';

/** Small line icon set (24 grid, 1.8 stroke). Decorative by default. */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></Svg>;
export const IconBox = (p: P) => <Svg {...p}><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></Svg>;
export const IconTruck = (p: P) => <Svg {...p}><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8" /><circle cx="6.5" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" /><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20" /><path d="M8 7h8M8 11h6" /></Svg>;
export const IconTarget = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></Svg>;
export const IconChart = (p: P) => <Svg {...p}><path d="M3 20h18" /><path d="M6 16v-5M11 16V7M16 16v-8M21 16v-3" /></Svg>;
export const IconBank = (p: P) => <Svg {...p}><path d="M3 9 12 4l9 5" /><path d="M4 9h16" /><path d="M6 9v8M10 9v8M14 9v8M18 9v8" /><path d="M3 20h18" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const IconInbox = (p: P) => <Svg {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6l2-8Z" /></Svg>;
export const IconDoc = (p: P) => <Svg {...p}><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconDraft = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15" /><path d="M21 20v-5h-5" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
export const IconArrowRight = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IconLayers = (p: P) => <Svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></Svg>;
export const IconBuilding = (p: P) => <Svg {...p}><path d="M4 21V5l8-2v18" /><path d="M12 8h8v13" /><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" /><path d="M2 21h20" /></Svg>;
export const IconTag = (p: P) => <Svg {...p}><path d="M3 12V3h9l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.5" /></Svg>;
export const IconSparkle = (p: P) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Svg>;

export const IconSend = (p: P) => <Svg {...p}><path d="M21 3 10 14" /><path d="M21 3 14.5 21l-4.5-7-7-4.5L21 3Z" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconUndo = (p: P) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>;
export const IconShare = (p: P) => <Svg {...p}><path d="M15 5l5 5-5 5" /><path d="M20 10H10a6 6 0 0 0-6 6v3" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Svg>;
export const IconSave = (p: P) => <Svg {...p}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3" /><path d="M8 21v-7h8v7" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></Svg>;
export const IconEye = (p: P) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;
export const IconFlow = (p: P) => <Svg {...p}><circle cx="5" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.5 6H14a3 3 0 0 1 3 3v6.5" /><path d="M5 8.5V15a3 3 0 0 0 3 3h8.5" /></Svg>;
export const IconFilter = (p: P) => <Svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></Svg>;

export const IconCopy = (p: P) => <Svg {...p}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>;

export const IconLock = (p: P) => <Svg {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>;

export const IconTree = (p: P) => <Svg {...p}><rect x="9" y="2.5" width="6" height="5" rx="1.2" /><rect x="2.5" y="16.5" width="6" height="5" rx="1.2" /><rect x="15.5" y="16.5" width="6" height="5" rx="1.2" /><path d="M12 7.5V12M5.5 16.5V12h13v4.5" /></Svg>;
export const IconGrid = (p: P) => <Svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4" /></Svg>;

export const DOMAIN_ICONS: Record<string, (p: P) => JSX.Element> = {
  material: IconBox,
  customer: IconUsers,
  vendor: IconTruck,
  glaccount: IconBook,
  costcenter: IconTarget,
  profitcenter: IconChart,
  bank: IconBank,
};
