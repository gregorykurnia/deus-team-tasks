import { openFirestore } from "./firestoreSetup";

// The tasks project: tasks, task groups, flows and shared settings.
export const db = openFirestore("[DEFAULT]", {
  apiKey: "AIzaSyCeCMcmOoIsg6TeRpskORfxQF45aUyVmVE",
  authDomain: "deus-team-tasks.firebaseapp.com",
  projectId: "deus-team-tasks",
  storageBucket: "deus-team-tasks.firebasestorage.app",
  messagingSenderId: "780312320511",
  appId: "1:780312320511:web:1f00313380bf822fae6fca",
});
