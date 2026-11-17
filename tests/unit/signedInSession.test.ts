import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  listen: vi.fn(), subscribe: vi.fn(),
  changes: null as null | ((user: { uid: string; email: string | null; getIdTokenResult: () => Promise<{ claims: { name: string } }> } | null) => Promise<void>),
}));
vi.mock("react", () => ({ useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => unknown) => { fake.subscribe(subscribe(() => {})); return snapshot(); } }));
vi.mock("@/lib/authClient", () => ({ clientAuth: {} }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (...args: unknown[]) => { fake.listen(...args); fake.changes = args[1] as typeof fake.changes; } }));
beforeEach(() => { vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1"); fake.listen.mockClear(); fake.subscribe.mockClear(); });
afterEach(() => { fake.subscribe.mock.calls.forEach(([unsubscribe]) => unsubscribe()); vi.unstubAllEnvs(); });

it("a slow older identity cannot restore a person after sign-out or replace a newer account", async () => {
  const { useSignInSession } = await import("@/lib/useSignedIn");
  expect(useSignInSession().ready).toBe(false);
  await vi.waitFor(() => expect(fake.listen).toHaveBeenCalledOnce());
  let finish: (value: { claims: { name: string } }) => void = () => {};
  const older = fake.changes!({ uid: "audrey.wijaya@deushcs.com", email: null, getIdTokenResult: () => new Promise((resolve) => { finish = resolve; }) });
  await fake.changes!(null);
  finish({ claims: { name: "Audrey" } }); await older;
  expect(useSignInSession()).toEqual({ ready: true, error: false, person: null });
  const nextOlder = fake.changes!({ uid: "audrey.wijaya@deushcs.com", email: null, getIdTokenResult: () => new Promise((resolve) => { finish = resolve; }) });
  await fake.changes!({ uid: "gregory.kurnia@deushcs.com", email: null, getIdTokenResult: async () => ({ claims: { name: "Gregory" } }) });
  finish({ claims: { name: "Audrey" } }); await nextOlder;
  expect(useSignInSession().person).toEqual({ email: "gregory.kurnia@deushcs.com", name: "Gregory" });
});

it("a token read failure is explicit and retry reattaches the listener and recovers", async () => {
  const { useSignInSession, retrySignInSession } = await import("@/lib/useSignedIn");
  useSignInSession();
  await vi.waitFor(() => expect(fake.listen).toHaveBeenCalledOnce());
  await fake.changes!({ uid: "audrey.wijaya@deushcs.com", email: null, getIdTokenResult: async () => { throw new Error("offline"); } });
  expect(useSignInSession()).toEqual({ ready: true, error: true, person: null });
  retrySignInSession();
  expect(useSignInSession().ready).toBe(false);
  await vi.waitFor(() => expect(fake.listen).toHaveBeenCalledTimes(2));
  await fake.changes!({ uid: "audrey.wijaya@deushcs.com", email: null, getIdTokenResult: async () => ({ claims: { name: "Audrey" } }) });
  expect(useSignInSession().person?.name).toBe("Audrey");
});
