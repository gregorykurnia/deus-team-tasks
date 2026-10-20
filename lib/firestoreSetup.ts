import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectToEmulatorIfTesting } from "./emulator";

// Opens a Firebase project's Firestore with a copy of the data kept on the
// device, so the app opens with the last data when there's no connection (A3).
// Open tabs share that copy. On the server (no IndexedDB) the copy is in memory.
export function openFirestore(name: string, config: FirebaseOptions): Firestore {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return getFirestore(existing); // hot reload: already set up
  const app = initializeApp(config, name);
  const db = initializeFirestore(app, {
    localCache:
      typeof window === "undefined"
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  connectToEmulatorIfTesting(db);
  return db;
}
