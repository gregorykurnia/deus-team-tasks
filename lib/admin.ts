import "server-only";
import { cert, getApps, initializeApp, type AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { USE_EMULATOR } from "./emulator";

// Feature routes must import this module after their signInEnabled() guard: while off,
// builds and requests must not need the owner's production key.
function options(): AppOptions {
  const emulator = USE_EMULATOR || !!process.env.FIRESTORE_EMULATOR_HOST || !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator) {
    if (process.env.NODE_ENV === "production") throw new Error("Firebase Admin emulators require a non-production process.");
    // Always isolate the server's test data, even when a real service-account key is present.
    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8180";
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9199";
    if (!/^(127\.0\.0\.1|localhost):8180$/.test(firestoreHost) || !/^(127\.0\.0\.1|localhost):9199$/.test(authHost)) {
      throw new Error("Firebase Admin tests require the local Firestore (8180) and Auth (9199) emulators.");
    }
    process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
    // Google Auth otherwise probes cloud metadata even for a local, unauthenticated emulator.
    process.env.METADATA_SERVER_DETECTION = "none";
    return { projectId: "demo-deus" };
  }
  if (!process.env.FIREBASE_ADMIN_KEY) throw new Error("FIREBASE_ADMIN_KEY is required outside the Firebase emulators.");
  try {
    const key = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
    if (key.project_id !== "deus-team-tasks") throw new Error("Wrong project.");
    return { projectId: key.project_id, credential: cert(key) };
  } catch {
    throw new Error("FIREBASE_ADMIN_KEY must be valid service-account JSON for deus-team-tasks.");
  }
}

const config = options(); // Validate even when hot reload has already initialized the app.
export const adminApp = getApps().find((app) => app.name === "deus-server") ?? initializeApp(config, "deus-server");
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
