const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${parseInt(day, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export function formatDateShort(d: string): string {
  const [, m, day] = d.split("-");
  return `${parseInt(day, 10)} ${MONTHS[parseInt(m, 10) - 1]}`;
}

export function targetDiffDays(t: string): number {
  return Math.floor((new Date(t).getTime() - Date.now()) / 86400000);
}

export function textColorForBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1A1D23" : "#FFFFFF";
}
