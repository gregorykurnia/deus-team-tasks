"use client";

import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { db } from "./firebase";
import { USE_EMULATOR } from "./emulator";

// Admin creates test tokens for demo-deus; task data keeps its existing emulator namespaces.
const app = USE_EMULATOR
  ? getApps().find((a) => a.name === "deus-auth-emulator") ?? initializeApp({ ...db.app.options, projectId: "demo-deus", apiKey: "demo-deus" }, "deus-auth-emulator")
  : db.app;
export const clientAuth = getAuth(app);
if (USE_EMULATOR && !clientAuth.emulatorConfig) connectAuthEmulator(clientAuth, "http://127.0.0.1:9199", { disableWarnings: true });
