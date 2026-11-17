import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { initialize, certificate, firestore, auth } = vi.hoisted(() => ({
  initialize: vi.fn((options, name) => ({ options, name })), certificate: vi.fn(() => "credential"),
  firestore: vi.fn(() => "firestore"), auth: vi.fn(() => "auth"),
}));
vi.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: initialize, cert: certificate }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: firestore }));
vi.mock("firebase-admin/auth", () => ({ getAuth: auth }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
  vi.stubEnv("FIREBASE_ADMIN_KEY", "");
  vi.stubEnv("METADATA_SERVER_DETECTION", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("server Firebase selection", () => {
  it("fails clearly without a key off the emulator, without initializing any SDK", async () => {
    await expect(import("../../lib/admin")).rejects.toThrow("FIREBASE_ADMIN_KEY is required");
    expect(initialize).not.toHaveBeenCalled();
  });
  it.each(["not json", '{"project_id":"wrong-project"}'])("rejects invalid credentials without exposing their contents", async (key) => {
    vi.stubEnv("FIREBASE_ADMIN_KEY", key);
    await expect(import("../../lib/admin")).rejects.toThrow("valid service-account JSON for deus-team-tasks");
    expect(initialize).not.toHaveBeenCalled();
  });
  it("uses the explicit production key and project", async () => {
    const key = { project_id: "deus-team-tasks", client_email: "fake", private_key: "not-a-real-secret" };
    vi.stubEnv("FIREBASE_ADMIN_KEY", JSON.stringify(key));
    const admin = await import("../../lib/admin");
    expect(certificate).toHaveBeenCalledWith(key);
    expect(initialize).toHaveBeenCalledWith({ projectId: "deus-team-tasks", credential: "credential" }, "deus-server");
    expect(admin.adminDb).toBe("firestore");
    expect(admin.adminAuth).toBe("auth");
  });
  it.each(["flag", "firestore", "auth"])("isolates both emulators when selected by %s, ignoring any key", async (selection) => {
    vi.stubEnv("FIREBASE_ADMIN_KEY", "not used");
    if (selection === "flag") vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "1");
    if (selection === "firestore") vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8180");
    if (selection === "auth") vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9199");
    const admin = await import("../../lib/admin");
    expect(initialize).toHaveBeenCalledWith({ projectId: "demo-deus" }, "deus-server");
    expect(initialize).toHaveBeenCalledWith({ projectId: "deus-team-tasks" }, "deus-server-data");
    expect(firestore).toHaveBeenCalledWith(admin.adminDataApp);
    expect(auth).toHaveBeenCalledWith(admin.adminApp);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8180");
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9199");
    expect(process.env.METADATA_SERVER_DETECTION).toBe("none");
    expect(certificate).not.toHaveBeenCalled();
  });
  it("refuses emulator hosts in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9199");
    await expect(import("../../lib/admin")).rejects.toThrow("non-production process");
  });
  it("refuses a remote or unexpected emulator endpoint", async () => {
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "remote.example.test:8180");
    await expect(import("../../lib/admin")).rejects.toThrow("local Firestore");
  });
});
