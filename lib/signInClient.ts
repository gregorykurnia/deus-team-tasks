// Shared by the page, navigation and session reader. No server-only code or secrets.
export interface SignedInPerson { email: string; name: string }

export function signedInPerson(uid: string, email: string | null, name: unknown): SignedInPerson | null {
  const address = (email || uid).trim().toLowerCase();
  return /^[^\s@]+@deushcs\.com$/.test(address) && typeof name === "string" && name.trim()
    ? { email: address, name: name.trim() } : null;
}

export function safeSignInNext(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return "/";
    const url = new URL(raw, "https://deus.invalid");
    if (url.origin !== "https://deus.invalid" || /^\/sign-in(?:\/|$)/i.test(decodeURIComponent(url.pathname))) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}

export function codeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
