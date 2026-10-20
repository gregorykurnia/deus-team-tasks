// Where a menu opens (guide 4.3): below its button, above when there's no room, and 12px inside the window.
import { describe, expect, it } from "vitest";
import { placeMenu } from "@/ui/placeMenu";

const viewport = { width: 1000, height: 700 };
const menu = { width: 240, height: 200 };
const button = (left: number, top: number, width = 120, height = 36) => ({ left, top, right: left + width, bottom: top + height });

describe("placeMenu", () => {
  it("opens below its button, 8px under it, lined up with its left edge", () => {
    expect(placeMenu(button(100, 100), menu, viewport)).toEqual({ left: 100, top: 144 });
  });

  it("opens above when there's no room below", () => {
    // The button's bottom is at 660: 8 + 200 would end at 868, past 700 - 12.
    expect(placeMenu(button(100, 624), menu, viewport)).toEqual({ left: 100, top: 416 });
  });

  it("stays 12px inside the window on the right", () => {
    expect(placeMenu(button(900, 100), menu, viewport).left).toBe(1000 - 240 - 12);
  });

  it("stays 12px inside the window on the left", () => {
    expect(placeMenu(button(2, 100), menu, viewport).left).toBe(12);
  });

  it("can line its right edge up with the button's", () => {
    expect(placeMenu(button(500, 100), menu, viewport, { alignRight: true }).left).toBe(620 - 240);
  });

  it("never starts above 12px, however tall the menu is", () => {
    expect(placeMenu(button(100, 300), { width: 240, height: 900 }, viewport).top).toBe(12);
  });
});
