const jakartaDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

export function leaveDay(at: number): string {
  return jakartaDay.format(at);
}
