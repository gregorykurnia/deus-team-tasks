// Imperative column-resize drag handling, kept outside component render
// scope so the eslint react-hooks/immutability rule doesn't flag DOM writes.
export function startColumnResize(
  e: React.MouseEvent,
  colKey: string,
  onResize: (key: string, width: number) => void
) {
  e.preventDefault();
  e.stopPropagation();
  const th = (e.target as HTMLElement).closest("th");
  if (!th) return;
  const startX = e.clientX;
  const startWidth = th.offsetWidth;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";

  function onMove(ev: MouseEvent) {
    const w = Math.max(40, startWidth + (ev.clientX - startX));
    if (th) {
      th.style.minWidth = `${w}px`;
      th.style.width = `${w}px`;
    }
  }
  function onUp(ev: MouseEvent) {
    const w = Math.max(40, startWidth + (ev.clientX - startX));
    onResize(colKey, w);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}
