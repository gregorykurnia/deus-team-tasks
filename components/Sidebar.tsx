"use client";

import Image from "next/image";
import { useState } from "react";

type LeafItem = { id: string; label: string; icon: string };
type GroupItem = { id: string; label: string; icon: string; children: LeafItem[] };
type NavItem = LeafItem | GroupItem;

function isGroup(item: NavItem): item is GroupItem {
  return "children" in item;
}

const NAV: NavItem[] = [
  {
    id: "tasks-group",
    label: "Tasks",
    icon: "✓",
    children: [
      { id: "operational", label: "Operational", icon: "🗂" },
      { id: "task-prospects", label: "Prospects", icon: "📈" },
      { id: "task-clients", label: "Clients", icon: "🤝" },
    ],
  },
  {
    id: "views",
    label: "Views",
    icon: "▦",
    children: [
      { id: "gantt", label: "Gantt / Deadline", icon: "┄" },
      { id: "daily", label: "Daily View", icon: "◷" },
      { id: "assignee", label: "Assignee View", icon: "▤" },
    ],
  },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "flow", label: "Flow", icon: "⇄" },
  { id: "clients", label: "Clients", icon: "◈" },
];

export type TabId =
  | "operational"
  | "task-prospects"
  | "task-clients"
  | "gantt"
  | "daily"
  | "assignee"
  | "calendar"
  | "flow"
  | "clients";

function groupOf(id: TabId): GroupItem | undefined {
  return NAV.find((i) => isGroup(i) && i.children.some((c) => c.id === id)) as GroupItem | undefined;
}

export function Sidebar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const g = groupOf(active);
    return new Set(g ? [g.id] : []);
  });

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectLeaf = (id: TabId) => {
    onChange(id);
    const g = groupOf(id);
    if (g) setOpenGroups((prev) => new Set(prev).add(g.id));
    setMobileOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-3 left-3 z-40 w-9 h-9 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <span className="text-base leading-none">☰</span>
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/30"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen shrink-0 border-r border-gray-200 bg-white flex flex-col transition-transform md:transition-[width] duration-150 z-50 w-64 md:w-56 ${
          collapsed ? "md:w-14" : "md:w-56"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
      <div
        className="flex items-center gap-2 px-3 h-14 border-b border-gray-200"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <Image
          src="/icon-512x512.png"
          alt="DEUS logo"
          width={32}
          height={32}
          className="w-8 h-8 shrink-0 rounded-lg object-cover"
        />
        {!collapsed && (
          <span className="text-sm font-semibold text-gray-900 truncate">DEUS Platform</span>
        )}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="md:hidden ml-auto w-7 h-7 flex items-center justify-center text-gray-400"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV.map((item) => {
          if (isGroup(item)) {
            const open = openGroups.has(item.id) || collapsed;
            const groupActive = item.children.some((c) => c.id === active);
            return (
              <div key={item.id}>
                <button
                  onClick={() => (collapsed ? setCollapsed(false) : toggleGroup(item.id))}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    groupActive ? "text-accent" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="w-4 text-center text-xs shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      <span
                        className={`text-[10px] text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
                      >
                        {"▸"}
                      </span>
                    </>
                  )}
                </button>
                {!collapsed && open && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
                    {item.children.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => selectLeaf(c.id as TabId)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                          active === c.id
                            ? "bg-accent/10 text-accent font-medium"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        <span className="flex-1 text-left truncate">{c.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => selectLeaf(item.id as TabId)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                active === item.id
                  ? "bg-accent/10 text-accent"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="w-4 text-center text-xs shrink-0">{item.icon}</span>
              {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div
        className="hidden md:block border-t border-gray-200 p-2"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          {collapsed ? "»" : "«  Collapse"}
        </button>
      </div>
    </aside>
    </>
  );
}
