import { connectFirestoreEmulator, type Firestore } from "firebase/firestore";

// Set by the smoke and unit tests, so the app talks to the local emulator
// (firebase.json) instead of the live projects. Never set in a deployment.
export const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "1";

export function connectToEmulatorIfTesting(db: Firestore) {
  if (!USE_EMULATOR) return;
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {
    // Already connected: hot reload ran this module again on the same instance.
  }
}
