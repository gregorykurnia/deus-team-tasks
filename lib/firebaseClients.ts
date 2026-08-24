import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Separate Firebase project used only by the Clients pipeline tracker.
const firebaseConfig = {
  apiKey: "AIzaSyB-l6NQ-M3iX8U18BDUhgcfcjb87gFy_bo",
  authDomain: "deus-client-tracker.firebaseapp.com",
  projectId: "deus-client-tracker",
  storageBucket: "deus-client-tracker.firebasestorage.app",
  messagingSenderId: "671429906929",
  appId: "1:671429906929:web:9e35609f60e652c2e93450",
};

const app = getApps().find((a) => a.name === "clients") ? getApp("clients") : initializeApp(firebaseConfig, "clients");
export const clientsDb = getFirestore(app);
