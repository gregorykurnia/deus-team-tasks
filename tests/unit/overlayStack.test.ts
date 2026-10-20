// The stack of open overlays (guide 4.11): Esc closes the top one only, a confirmation can tell it sits over a sheet,
// and only sheets and dialogs lock the page's scroll.
import { afterEach, describe, expect, it } from "vitest";
import { closeTopLayer, hasLayer, lockCount, pushLayer, resetLayers } from "@/ui/overlayStack";

afterEach(resetLayers);

function layer(kind: "sheet" | "dialog" | "menu", log: string[], lock = kind !== "menu") {
  return { kind, lock, close: () => log.push(kind) };
}

describe("overlay stack", () => {
  it("closes only the top overlay", () => {
    const log: string[] = [];
    pushLayer(layer("sheet", log));
    pushLayer(layer("dialog", log));
    expect(closeTopLayer()).toBe(true);
    expect(log).toEqual(["dialog"]);
  });

  it("says nothing was closed when no overlay is open", () => {
    expect(closeTopLayer()).toBe(false);
  });

  it("forgets an overlay once it is removed, so the one below becomes the top", () => {
    const log: string[] = [];
    pushLayer(layer("sheet", log));
    const removeDialog = pushLayer(layer("dialog", log));
    removeDialog();
    closeTopLayer();
    expect(log).toEqual(["sheet"]);
  });

  it("tells a dialog it sits over a sheet", () => {
    const log: string[] = [];
    expect(hasLayer("sheet")).toBe(false);
    pushLayer(layer("sheet", log));
    expect(hasLayer("sheet")).toBe(true);
  });

  it("counts only the overlays that lock the page's scroll", () => {
    const log: string[] = [];
    pushLayer(layer("sheet", log));
    pushLayer(layer("menu", log));
    expect(lockCount()).toBe(1);
  });
});
