/** Small inline replacements for the sap-icon:// glyphs used by the app. */
import React from "react";

export type IconName =
  | "task"
  | "business-objects-experience"
  | "excel-attachment"
  | "inspection"
  | "accept"
  | "decline"
  | "information"
  | "error"
  | "search"
  | "calendar"
  | "arrow-left"
  | "menu"
  | "user";

const paths: Record<IconName, React.ReactNode> = {
  task: (
    <>
      <rect x="5" y="3.5" width="14" height="18" rx="1.5" />
      <path d="M9 3.5V2h6v1.5" />
      <path d="M8.5 11l2 2 4-4.5" />
      <path d="M8.5 17h7" />
    </>
  ),
  "business-objects-experience": (
    <>
      <path d="M3 20.5h18" />
      <rect x="4.5" y="12" width="3.5" height="8.5" />
      <rect x="10.25" y="7" width="3.5" height="13.5" />
      <rect x="16" y="3.5" width="3.5" height="17" />
    </>
  ),
  "excel-attachment": (
    <>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z" />
      <path d="M14 2.5v5h5" />
      <path d="M9 11.5l5 6M14 11.5l-5 6" />
    </>
  ),
  inspection: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3L21 21" />
      <path d="M7.8 10.6l1.9 1.9 3.6-3.8" />
    </>
  ),
  accept: <path d="M4 12.5l5 5L20 6.5" />,
  decline: <path d="M6 6l12 12M18 6L6 18" />,
  information: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6" />
      <path d="M12 7.2v.1" strokeWidth="2.6" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3L21 21" />
    </>
  ),
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={"ui-icon " + (className || "")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}
