// The app's areas, in the side bar's order (guide 3), and which one a path belongs to.
import type { IconName } from "@/ui/Icon";

export type AreaId = "today" | "tasks" | "plan" | "companies" | "notes" | "past" | "flows";

export interface Area {
  id: AreaId;
  label: string;
  icon: IconName;
  href: string;
  blurb?: string; // the one line under it in More, for the areas that live there on phones
}

export const AREAS: Area[] = [
  { id: "today", label: "Today", icon: "sun", href: "/" },
  { id: "tasks", label: "All tasks", icon: "list", href: "/tasks" },
  { id: "plan", label: "Plan", icon: "cal", href: "/plan", blurb: "Deadlines, events and who carries what" },
  { id: "companies", label: "Prospects", icon: "building", href: "/companies" },
  { id: "notes", label: "Qualification notes", icon: "note", href: "/notes", blurb: "Qualify prospects" },
  { id: "past", label: "Past clients", icon: "archive", href: "/past", blurb: "Every company we have served" },
  { id: "flows", label: "Flows", icon: "flow", href: "/flows", blurb: "How work moves between people" },
];

// On phones these sit behind More, which counts as current while one is open.
export const MORE_AREAS = AREAS.filter((a) => a.blurb);

export function areaOf(pathname: string): AreaId | null {
  if (pathname === "/") return "today";
  const area = AREAS.find((a) => a.href !== "/" && (pathname === a.href || pathname.startsWith(`${a.href}/`)));
  return area?.id ?? null;
}

export function groupHref(groupId: string): string {
  return `/tasks/groups/${encodeURIComponent(groupId)}`;
}

// A link that opens something over the current screen, kept in the address so
// a reload keeps it and the phone's back gesture closes it. The screen's own
// address state (a filter, a view) stays; params named in `drop` go.
export function over(pathname: string, search: string | URLSearchParams, param: string, drop: string[] = []): string {
  const params = new URLSearchParams(search);
  drop.forEach((key) => params.delete(key));
  new URLSearchParams(param).forEach((value, key) => params.set(key, value));
  return withSearch(pathname, params);
}

// The address with some params taken off, as when an overlay closes.
export function without(pathname: string, search: string | URLSearchParams, keys: string[]): string {
  const params = new URLSearchParams(search);
  keys.forEach((key) => params.delete(key));
  return withSearch(pathname, params);
}

function withSearch(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
