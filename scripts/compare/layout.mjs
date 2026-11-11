// Compare against the capture size, not innerWidth: mobile overflow can expand the latter.
export async function auditLayout(page, { requireTaskSheet = false } = {}) {
  return page.evaluate(({ capture, requireTaskSheet }) => {
    const errors = [];
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !el.closest(".sr-only");
    };
    const inside = (box) => box.left >= -1 && box.top >= -1 && box.right <= capture.width + 1 && box.bottom <= capture.height + 1;
    const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 100);
    const bounds = (el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    };
    if (Math.abs(innerWidth - capture.width) > 1 || Math.abs(innerHeight - capture.height) > 1) {
      errors.push(`Viewport expanded: ${innerWidth}×${innerHeight}; capture ${capture.width}×${capture.height}`);
    }
    if (document.documentElement.scrollWidth > capture.width + 1) errors.push("Horizontal page overflow");
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(visible);
    for (const dialog of dialogs) {
      if (!inside(dialog.getBoundingClientRect())) errors.push(`Offscreen sheet/dialog: ${label(dialog)}`);
    }
    const root = dialogs.at(-1);
    if (requireTaskSheet) {
      const description = root?.querySelector('textarea[aria-label="Description"]');
      // Field connects its visible label with htmlFor.
      const field = description ?? [...(root?.querySelectorAll("textarea") ?? [])].find((el) =>
        [...el.labels].some((label) => label.textContent.trim() === "Description"));
      const save = [...(root?.querySelectorAll("button") ?? [])].find((el) => el.textContent.trim() === "Save changes");
      for (const [name, el] of [["Task description", field], ["Save changes", save]]) {
        if (!el || !visible(el)) errors.push(`Missing task sheet control: ${name}`);
        else if (!inside(el.getBoundingClientRect())) errors.push(`Offscreen task sheet control: ${name}`);
      }
    }
    for (const el of root?.querySelectorAll("button, a, input, textarea, select, label, img") ?? []) {
      if (!visible(el)) continue;
      const box = el.getBoundingClientRect();
      if (!inside(box)) continue; // The scrolling sheet body may intentionally continue below the footer.
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      let clipped = false;
      for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
        const rect = parent.getBoundingClientRect(), style = getComputedStyle(parent);
        if ((style.overflowY !== "visible" && (y < rect.top || y > rect.bottom)) ||
            (style.overflowX !== "visible" && (x < rect.left || x > rect.right))) clipped = true;
      }
      if (clipped) continue;
      if (el.matches("button, a, input, textarea, select") && !el.contains(document.elementFromPoint(x, y))) {
        errors.push(`Covered control: ${label(el)}`);
      }
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis" && !el.matches("input, select")) {
        errors.push(`Overflowing text: ${label(el)}`);
      }
      // Native selects keep scrollWidth equal to clientWidth even when the selected text is cut off.
      if (el instanceof HTMLSelectElement && !el.multiple && el.size <= 1) {
        const style = getComputedStyle(el);
        const canvas = document.createElement("canvas").getContext("2d");
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        canvas.letterSpacing = style.letterSpacing;
        const width = canvas.measureText(el.selectedOptions[0]?.textContent ?? "").width;
        const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (width > available + 1 && style.textOverflow !== "ellipsis") errors.push(`Select value clips without ellipsis: ${label(el)}`);
      }
      if (el instanceof HTMLImageElement && (!el.complete || !el.naturalWidth)) errors.push(`Unloaded image: ${el.alt}`);
    }
    return { capture, window: { width: innerWidth, height: innerHeight }, dialogs: dialogs.map(bounds), errors };
  }, { capture: page.viewportSize(), requireTaskSheet });
}
