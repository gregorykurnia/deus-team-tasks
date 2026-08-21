import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCeCMcmOoIsg6TeRpskORfxQF45aUyVmVE",
  authDomain: "deus-team-tasks.firebaseapp.com",
  projectId: "deus-team-tasks",
  storageBucket: "deus-team-tasks.firebasestorage.app",
  messagingSenderId: "780312320511",
  appId: "1:780312320511:web:1f00313380bf822fae6fca",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
