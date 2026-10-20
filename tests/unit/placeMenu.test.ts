// Where a menu opens (guide 4.3): below its button, above when there's no room, and 12px inside the window.
import { describe, expect, it } from "vitest";
import { inView, placeMenu } from "@/ui/placeMenu";

const viewport = { width: 1000, height: 700 };
const menu = { width: 240, height: 200 };
const button = (left: number, top: number, width = 120, height = 36) => ({ left, top, right: left + width, bottom: top + height });

describe("placeMenu", () => {
  it("opens below its button, 8px under it, lined up with its left edge", () => {
    expect(placeMenu(button(100, 100), menu, viewport)).toEqual({ left: 100, top: 144, maxHeight: 700 - 12 - 144 });
  });

  it("opens above when there's no room below", () => {
    // The button's bottom is at 660: 8 + 200 would end at 868, past 700 - 12.
    expect(placeMenu(button(100, 624), menu, viewport)).toEqual({ left: 100, top: 416, maxHeight: 624 - 8 - 12 });
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

  it("takes the side with more room when it fits on neither, and scrolls inside rather than cover its button", () => {
    const tall = { width: 240, height: 900 };
    // Button at 300 to 336: 288 above, 344 below.
    expect(placeMenu(button(100, 300), tall, viewport)).toEqual({ left: 100, top: 344, maxHeight: 344 });
    // Button at 420 to 456: 400 above, 232 below.
    const up = placeMenu(button(100, 420), tall, viewport);
    expect(up).toEqual({ left: 100, top: 12, maxHeight: 400 });
    expect(up.top + up.maxHeight).toBeLessThanOrEqual(420 - 8);
  });

  it("opens above when it fits there and not below, however little room is left below", () => {
    const p = placeMenu(button(100, 560), menu, viewport); // 108 below, 540 above
    expect(p.top + menu.height).toBe(560 - 8);
  });

  it("stays 12px inside on both sides when the menu is wider than the window", () => {
    expect(placeMenu(button(100, 100), { width: 400, height: 200 }, { width: 390, height: 844 }).left).toBe(12);
  });

  it("knows when its button has scrolled out of sight", () => {
    expect(inView(button(100, 100), viewport)).toBe(true);
    expect(inView(button(100, -40), viewport)).toBe(false);
    expect(inView(button(100, 700), viewport)).toBe(false);
  });
});
