import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';

// User provided Firebase configuration for MYNOOK
// Supports optional VITE_FIREBASE_* environment overrides while preserving existing project settings
const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
// Security check: ensure Gemini API key is NEVER passed into Firebase
const isGeminiKeyMistakenlyPassed =
  envApiKey &&
  (envApiKey === (import.meta.env as any).VITE_GEMINI_API_KEY ||
   envApiKey === (import.meta.env as any).GEMINI_API_KEY);

const resolvedApiKey =
  !isGeminiKeyMistakenlyPassed && envApiKey
    ? envApiKey
    : "AIzaSyCgINyZYWQQl9ZHo2THDUX_VlMXT7hN6Nc";

export const firebaseConfig = {
  apiKey: resolvedApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mynoook.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mynoook",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mynoook.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "519227039374",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:519227039374:web:29ff986126749b881e73df"
};

export const RTDB_URL =
  import.meta.env.VITE_FIREBASE_DATABASE_URL ||
  "https://mynoook-default-rtdb.asia-southeast1.firebasedatabase.app/";

// Initialize modular Firebase services safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const realtimeDb = getDatabase(app, RTDB_URL);
export const auth = getAuth(app);

let currentUser: User | null = null;

// Setup anonymous authentication automatically for author session
export const initAuth = (): Promise<User | null> => {
  return new Promise((resolve) => {
    try {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser = user;
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            currentUser = cred.user;
            resolve(cred.user);
          } catch (error: any) {
            console.warn("Anonymous auth failed or offline, continuing in guest mode:", error?.message || error);
            currentUser = null;
            resolve(null);
          }
        }
      });
    } catch (e: any) {
      console.warn("Firebase auth initialization notice:", e?.message || e);
      currentUser = null;
      resolve(null);
    }
  });
};

export const getCurrentUser = (): User | null => currentUser;
