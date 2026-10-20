// What the "No connection" banner says on each screen (guide 5.8, D-014): every area refuses changes without a connection,
// except qualification notes, which keep writing on the device, and flows, which are read only.
export function offlineBannerWords(pathname: string, loadedWhen: string | null): string {
  if (!loadedWhen) return "Nothing has loaded yet. Everything will appear once you are back online.";
  const seen = `You are seeing what was loaded ${loadedWhen}.`;
  if (pathname === "/notes" || pathname.startsWith("/notes/"))
    return `${seen} What you write in qualification notes is kept on this device and saved when you are back online. Starting, linking and deleting notes need a connection.`;
  if (pathname === "/flows" || pathname.startsWith("/flows/")) return `${seen} Flows can be read but not edited until you are back online.`;
  return `${seen} Changes can't be saved until you are back online.`;
}
