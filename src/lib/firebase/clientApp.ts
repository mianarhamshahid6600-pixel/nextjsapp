

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Your web app's Firebase configuration is now read from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null; // Firestore instance
let firebaseInitializationError: Error | null = null;

try {
  // Check if any config value is missing
  if (Object.values(firebaseConfig).some(value => !value)) {
    throw new Error("Firebase configuration is incomplete. Please check your environment variables (e.g., in a .env.local file).");
  }

  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  if (app) {
    auth = getAuth(app);
    db = getFirestore(app); // Initialize Firestore
  } else {
    throw new Error("Firebase app could not be initialized. Ensure firebaseConfig is correct and Firebase services are available.");
  }
  if (!auth) {
    throw new Error("Firebase Auth could not be initialized from Firebase app. Auth service might be unavailable or misconfigured.");
  }
  if (!db) {
    throw new Error("Firebase Firestore could not be initialized from Firebase app. Firestore service might be unavailable or misconfigured.");
  }

} catch (e: any) {
  if (typeof window !== "undefined") {
    console.error("Firebase client-side initialization error:", e.message);
  } else {
    console.error("Firebase server-side initialization/import error:", e.message);
  }
  firebaseInitializationError = e;
}

export { app, auth, db, firebaseInitializationError };
