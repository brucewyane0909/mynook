import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';

// User provided Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCgINyZYWQQl9ZHo2THDUX_VlMXT7hN6Nc",
  authDomain: "mynoook.firebaseapp.com",
  projectId: "mynoook",
  storageBucket: "mynoook.firebasestorage.app",
  messagingSenderId: "519227039374",
  appId: "1:519227039374:web:29ff986126749b881e73df"
};

export const RTDB_URL = "https://mynoook-default-rtdb.asia-southeast1.firebasedatabase.app/";

// Initialize modular Firebase services safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const realtimeDb = getDatabase(app, RTDB_URL);
export const auth = getAuth(app);

let currentUser: User | null = null;

// Setup anonymous authentication automatically for author session
export const initAuth = (): Promise<User | null> => {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          currentUser = cred.user;
          resolve(cred.user);
        } catch (error) {
          console.warn("Anonymous auth failed or offline, continuing in guest mode:", error);
          resolve(null);
        }
      }
    });
  });
};

export const getCurrentUser = (): User | null => currentUser;
