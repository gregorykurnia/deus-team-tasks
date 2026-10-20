import type { ReactNode } from "react";

// The design's icon set: the prototype's ICONS map (design/prototype/assets/app.js), as JSX.
// Each entry is the icon's shapes on the 24px grid; Icon sets the stroke.
const ICONS = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  list: (
    <path d="m4 7 2 2 3.5-3.5M4 15.5l2 2 3.5-3.5M13 7.5h7M13 16h7" />
  ),
  cal: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  building: (
    <path d="M4 20.5V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14.5M15 10h3a2 2 0 0 1 2 2v8.5M2.5 20.5h19M8 8h3M8 12h3M8 16h3" />
  ),
  note: (
    <>
      <path d="M6 3.5h8l4.5 4.5v12.5H6z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="3" />
      <path d="M15.5 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="2" />
      <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
    </>
  ),
  flow: (
    <>
      <rect x="3" y="3.5" width="7" height="5" rx="2" />
      <rect x="14" y="15.5" width="7" height="5" rx="2" />
      <path d="M6.5 8.5v4a3 3 0 0 0 3 3h4.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: (
    <path d="M12 5v14M5 12h14" />
  ),
  star: (
    <path fill="currentColor" stroke="none" d="m12 3.2 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z" />
  ),
  starline: (
    <path d="m12 3.6 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.3 6.9 19l1.1-5.6-4.2-3.9 5.7-.7z" />
  ),
  ext: (
    <path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M16 5.5a3 3 0 0 1 0 6M18 14.8c2 .7 3.2 2.5 3.5 5.2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </>
  ),
  check: (
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  ),
  x: (
    <path d="M6 6l12 12M18 6 6 18" />
  ),
  down: (
    <path d="m6 9 6 6 6-6" />
  ),
  up: (
    <path d="m6 15 6-6 6 6" />
  ),
  sort: (
    <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
  ),
  cols: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9.5 4.5v15M14.5 4.5v15" />
    </>
  ),
  filter: (
    <path d="M4 6h16M7 12h10M10 18h4" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0M12 19.5h.01" />
      <path d="M3 3l18 18" />
    </>
  ),
  sync: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 13a8 8 0 0 0 14.3 4.5L20 15.5" />
      <path d="M4 4v4.5h4.5M20 20v-4.5h-4.5" />
    </>
  ),
  trash: (
    <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M9.5 7V4.5h5V7" />
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  people: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.7-3.7 3.4-5.5 7-5.5s6.3 1.8 7 5.5" />
    </>
  ),
  chat: (
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" />
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  folder: (
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />
  ),
  arrow: (
    <path d="M5 12h14M13 6l6 6-6 6" />
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  minus: (
    <path d="M6 12h12" />
  ),
  checks: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  left: (
    <path d="m15 6-6 6 6 6" />
  ),
  right: (
    <path d="m9 6 6 6-6 6" />
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V4.5" />
      <path d="M5.5 4.5h11.5l-2.5 4 2.5 4H5.5" />
    </>
  ),
  bolt: (
    <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />
  ),
  pause: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9v6M14 9v6" />
    </>
  ),
  download: (
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  ),
  snow: (
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
  ),
  swap: (
    <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  hourglass: (
    <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5" />
  ),
  text: (
    <path d="M5 7V5h14v2M12 5v14M9 19h6" />
  ),
  hash: (
    <path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h16M3.5 15h16" />
  ),
  choice: (
    <>
      <circle cx="7" cy="8" r="2" />
      <circle cx="7" cy="16" r="2" />
      <path d="M12 8h8M12 16h8" />
    </>
  ),
  tree: (
    <>
      <path d="M6 4v12a2 2 0 0 0 2 2h4M6 9h6" />
      <rect x="13" y="6" width="7" height="6" rx="2" />
      <rect x="13" y="15" width="7" height="6" rx="2" />
    </>
  ),
  diamond: (
    <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />
  ),
  install: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M12 7.5v7M9 11.5l3 3 3-3M10.5 18.5h3" />
    </>
  ),
  share: (
    <>
      <path d="M12 3.5v11M8 7l4-4 4 4" />
      <path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </>
  ),
  addsq: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  up2: (
    <path d="M12 19V5M6 11l6-6 6 6" />
  ),
  down2: (
    <path d="M12 5v14M6 13l6 6 6-6" />
  ),
  para: (
    <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

// 11 to 12px in rows and person chips; 13 to 16px inside buttons, chips and pills; 18px by default;
// 19px in the side bar; 21 to 22px in the tab bar; 28px for empty-state art (the prototype's sizes).
export type IconSize = 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 28;

interface IconProps {
  name: IconName;
  size?: IconSize;
  label?: string; // only for an icon that says something on its own; otherwise it is decorative
  className?: string;
}

// 24px grid, 2.1px round strokes, currentColor (guide 2.6).
export default function Icon({ name, size = 18, label, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["shrink-0", className].filter(Boolean).join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ICONS[name]}
    </svg>
  );
}
