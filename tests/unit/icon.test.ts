// The icon set (design guide 2.6): every name draws on the 24px grid, a labelled icon is read out at the
// requested size, and a decorative one is hidden from screen readers.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Icon, { ICON_NAMES } from "@/ui/Icon";

// The icons the guide's table names, by their names in the prototype's ICONS map.
const GUIDE_ICONS = [
  "sun", "list", "cal", "building", "note", "archive", "flow", "team", "plus", "done", "check", "alert",
  "clock", "snow", "hourglass", "flag", "bolt", "pause", "lock", "wifi", "sync", "ext", "star", "starline",
  "tree", "diamond", "undo", "sliders", "cols", "download", "install", "phone", "mail", "people", "chat", "pin",
];

describe("Icon", () => {
  it("has every icon the guide's table names", () => {
    for (const name of GUIDE_ICONS) expect(ICON_NAMES).toContain(name);
  });

  it("draws each icon on the 24px grid and hides it from screen readers by default", () => {
    for (const name of ICON_NAMES) {
      const markup = renderToStaticMarkup(createElement(Icon, { name }));
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke="currentColor"');
      expect(markup).toContain('aria-hidden="true"');
    }
  });

  it("reads a labelled icon out at the requested size", () => {
    const markup = renderToStaticMarkup(createElement(Icon, { name: "alert", label: "Overdue", size: 21 }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Overdue"');
    expect(markup).not.toContain("aria-hidden");
    expect(markup).toContain('width="21"');
    expect(markup).toContain('height="21"');
  });
});
