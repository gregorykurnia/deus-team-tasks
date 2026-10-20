// Where a menu opens (guide 4.3): below its button, or above when it fits there and not below. When it fits on neither
// side it takes the side with more room and scrolls inside (maxHeight), so it never covers its button. Kept 12px inside
// the window on every edge. Pure, so it can be tested without a browser.
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

export interface Placement {
  left: number;
  top: number;
  maxHeight: number; // the room on the side it opens to
}

const GAP = 8; // between the button and the menu
const EDGE = 12; // the window's margin

export function placeMenu(anchor: Box, menu: Size, viewport: Size, options: { alignRight?: boolean } = {}): Placement {
  let left = options.alignRight ? anchor.right - menu.width : anchor.left;
  left = Math.max(EDGE, Math.min(left, viewport.width - menu.width - EDGE));

  const below = Math.max(0, viewport.height - EDGE - (anchor.bottom + GAP));
  const above = Math.max(0, anchor.top - GAP - EDGE);
  const downwards = menu.height <= below || (menu.height > above && below >= above);
  if (downwards) return { left, top: anchor.bottom + GAP, maxHeight: below };
  return { left, top: anchor.top - GAP - Math.min(menu.height, above), maxHeight: above };
}

// Whether the button is still on screen at all: a menu whose button scrolled away closes.
export function inView(anchor: Box, viewport: Size): boolean {
  return anchor.bottom > 0 && anchor.top < viewport.height && anchor.right > 0 && anchor.left < viewport.width;
}
