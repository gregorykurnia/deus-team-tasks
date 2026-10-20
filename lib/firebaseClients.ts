import { openFirestore } from "./firestoreSetup";

// Separate Firebase project used only by the Clients pipeline tracker.
export const clientsDb = openFirestore("clients", {
  apiKey: "AIzaSyB-l6NQ-M3iX8U18BDUhgcfcjb87gFy_bo",
  authDomain: "deus-client-tracker.firebaseapp.com",
  projectId: "deus-client-tracker",
  storageBucket: "deus-client-tracker.firebasestorage.app",
  messagingSenderId: "671429906929",
  appId: "1:671429906929:web:9e35609f60e652c2e93450",
});
