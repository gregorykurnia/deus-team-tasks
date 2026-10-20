// Where a menu opens (guide 4.3): below its button, above when there's no room below, and kept 12px
// inside the window. Pure, so it can be tested without a browser.
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

const GAP = 8; // between the button and the menu
const EDGE = 12; // the window's margin

export function placeMenu(anchor: Box, menu: Size, viewport: Size, options: { alignRight?: boolean } = {}) {
  let left = options.alignRight ? anchor.right - menu.width : anchor.left;
  left = Math.max(EDGE, Math.min(left, viewport.width - menu.width - EDGE));

  let top = anchor.bottom + GAP;
  if (top + menu.height > viewport.height - EDGE) top = Math.max(EDGE, anchor.top - menu.height - GAP);
  return { left, top };
}
