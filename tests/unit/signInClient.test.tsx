import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { codeDigits, safeSignInNext, signedInPerson } from "@/lib/signInClient";
import MoreSheet from "@/desk/MoreSheet";
import SideNav from "@/desk/SideNav";
import SignInPage from "../../app/sign-in/page";
import { needsHomeScreen } from "@/features/sign-in/HomeScreenSteps";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("more=1"), usePathname: () => "/plan", useRouter: () => ({ replace: vi.fn() }),
  notFound: () => { throw new Error("404"); },
}));
vi.mock("@/lib/useSignedIn", () => ({ useSignInSession: () => ({ ready: true, person: null, error: false }) }));
vi.mock("@/desk/DeskData", () => ({
  useTasks: () => ({ rows: [], loading: false }), useTaskGroups: () => ({ rows: [], loading: false }), useCompaniesById: () => new Map(),
}));
vi.mock("@/desk/LiveDot", () => ({ default: () => <span>Live</span> }));
vi.mock("@/desk/useInstalled", () => ({ useInstalled: () => false }));
// The unit render needs the More contents, without a browser portal or animation.
vi.mock("@/ui/Sheet", () => ({ default: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("sign-in navigation and account identity", () => {
  it("detects iPad desktop mode and actual standalone mode without trusting remembered installation", () => {
    vi.stubGlobal("navigator", { userAgent: "Macintosh Safari", platform: "MacIntel", maxTouchPoints: 5, standalone: false });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(needsHomeScreen()).toBe(true);
    vi.stubGlobal("navigator", { userAgent: "Macintosh Safari", platform: "MacIntel", maxTouchPoints: 5, standalone: true });
    expect(needsHomeScreen()).toBe(false);
    vi.stubGlobal("navigator", { userAgent: "iPhone Safari", platform: "iPhone", maxTouchPoints: 1, standalone: false });
    expect(needsHomeScreen()).toBe(true);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(needsHomeScreen()).toBe(false);
  });
  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/%5cevil.example", "/\nevil.example", "/sign-in", "/%73ign-in", "/sign-in?next=/sign-in", "/foo/../sign-in", "/%zz"])("rejects unsafe or looping return path %s", (raw) => {
    expect(safeSignInNext(raw)).toBe("/");
  });
  it.each(["/plan?view=people&person=Audrey", "/?task=t1", "/tasks#details"])("keeps same-site screen state %s", (raw) => expect(safeSignInNext(raw)).toBe(raw));
  it("reads custom-token identity on sign-in and resume even though Firebase email is null", () => {
    expect(signedInPerson(" Audrey.Wijaya@deushcs.com ", null, " Audrey ")).toEqual({ email: "audrey.wijaya@deushcs.com", name: "Audrey" });
    expect(signedInPerson("uid", "audrey.wijaya@deushcs.com", "Audrey")).toEqual({ email: "audrey.wijaya@deushcs.com", name: "Audrey" });
    expect(signedInPerson("uid", null, "Audrey")).toBeNull();
    expect(signedInPerson("audrey.wijaya@deushcs.com", null, " ")).toBeNull();
    expect(signedInPerson("audrey.wijaya@deushcs.com", null, undefined)).toBeNull();
  });
  it("accepts six pasted digits with spaces and rejects letters as digits", () => {
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("abc")).toBe("");
    expect(codeDigits("0123456789")).toBe("012345");
  });
  it("hides sign-in in both actual navigation components and returns 404 with the flag off", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "0");
    expect(renderToStaticMarkup(<MoreSheet />)).not.toContain("Sign in");
    expect(renderToStaticMarkup(<SideNav />)).not.toContain("Sign in");
    expect(() => SignInPage()).toThrow("404");
  });
  it("shows both navigation entries when enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1");
    expect(renderToStaticMarkup(<MoreSheet />)).toContain("Sign in");
    expect(renderToStaticMarkup(<SideNav />)).toContain("Sign in");
  });
});
