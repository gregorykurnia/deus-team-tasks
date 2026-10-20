// The overlays that are open, in the order they opened (guide 4.11). Esc closes the top one only, a
// confirmation can tell it sits over a sheet, and only sheets and dialogs lock the page's scroll.
export type LayerKind = "sheet" | "dialog" | "menu";

export interface Layer {
  kind: LayerKind;
  lock: boolean;
  close: () => void;
}

const stack: Layer[] = [];

// Returns the function that takes the layer off the stack again.
export function pushLayer(layer: Layer): () => void {
  stack.push(layer);
  return () => {
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function hasLayer(kind: LayerKind): boolean {
  return stack.some((l) => l.kind === kind);
}

// Anything open at all: a screen's own Esc (stop selecting) waits until every overlay is closed.
export function hasAnyLayer(): boolean {
  return stack.length > 0;
}

export function lockCount(): number {
  return stack.filter((l) => l.lock).length;
}

// For tests: forget every layer.
export function resetLayers() {
  stack.length = 0;
}
