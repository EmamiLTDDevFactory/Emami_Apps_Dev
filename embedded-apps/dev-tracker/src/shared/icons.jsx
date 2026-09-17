import React from 'react';

// Shared line-icon set — same stroke weight/rounding as the icons already hand-written
// throughout the app (width 14-18, strokeWidth ~2, round caps/joins). Centralized here so
// the Sidebar, Home KPI strip and the new placeholder pages draw from one consistent set
// instead of every call site re-writing its own <svg>.
function Icon({ children, size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export const HomeIcon = (p) => <Icon {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></Icon>;
export const BoardIcon = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M8 4v17M15 4v17" /></Icon>;
export const UsersIcon = (p) => <Icon {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" /><circle cx="17.5" cy="8.5" r="2.6" /><path d="M15.5 14.3c2.7.4 4.5 2.5 4.5 5.7" /></Icon>;
export const DatabaseIcon = (p) => <Icon {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5V12c0 1.66 3.58 3 8 3s8-1.34 8-3V5.5" /><path d="M4 12v6.5c0 1.66 3.58 3 8 3s8-1.34 8-3V12" /></Icon>;
export const ShieldIcon = (p) => <Icon {...p}><path d="M12 3l7.5 3v5.4c0 5-3.2 8.2-7.5 9.6-4.3-1.4-7.5-4.6-7.5-9.6V6L12 3Z" /><path d="M9 12.2l2.2 2.2L15.5 10" /></Icon>;
export const StarBadgeIcon = (p) => <Icon {...p}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.2 6.8 19.1l1-5.8-4.3-4.1 5.9-.9L12 3Z" /></Icon>;
export const UploadCloudIcon = (p) => <Icon {...p}><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.4 9.3 4 4 0 0 1 17 18H7Z" /><path d="M12 20v-7M9.2 15.8 12 13l2.8 2.8" /></Icon>;
export const LogOutIcon = (p) => <Icon {...p}><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" /></Icon>;
export const ArrowRightIcon = (p) => <Icon {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Icon>;
export const LayersIcon = (p) => <Icon {...p}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /></Icon>;
export const AlertIcon = (p) => <Icon {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><circle cx="12" cy="17.2" r=".3" fill="currentColor" stroke="none" /></Icon>;
export const CheckCircleIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.6L16.5 9" /></Icon>;
export const ClockIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></Icon>;
export const SparkIcon = (p) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.8 5.8l2.1 2.1M16.1 16.1l2.1 2.1M18.2 5.8l-2.1 2.1M7.9 16.1l-2.1 2.1" /><circle cx="12" cy="12" r="2.6" /></Icon>;
export const BarChartIcon = (p) => <Icon {...p}><path d="M4 20V10M12 20V4M20 20v-7" /></Icon>;
export const PieChartIcon = (p) => <Icon {...p}><path d="M12 3v9l7.8 4.5" /><path d="M20.8 13.5A9 9 0 1 1 12 3" /></Icon>;
export const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" /></Icon>;
export const BellIcon = (p) => <Icon {...p}><path d="M6 10a6 6 0 1 1 12 0c0 3.2 1 5 2 6.5H4c1-1.5 2-3.3 2-6.5Z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>;
export const SettingsIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.6 5.6l2.1 2.1M17.3 16.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 18.4l2.1-2.1M17.3 7.7l2.1-2.1" /></Icon>;
export const TrendUpIcon = (p) => <Icon {...p}><polyline points="4 15 10 9 14 13 20 6" /><polyline points="14 6 20 6 20 12" /></Icon>;
export const TrendDownIcon = (p) => <Icon {...p}><polyline points="4 9 10 15 14 11 20 18" /><polyline points="14 18 20 18 20 12" /></Icon>;
