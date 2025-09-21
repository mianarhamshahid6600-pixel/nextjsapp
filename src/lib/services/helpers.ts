

import { app, auth as firebaseAuthInstance, db as firestoreInstance, firebaseInitializationError } from '@/lib/firebase/clientApp';
import { collection, getDocs, writeBatch, query, type QueryConstraint, doc, limit, getCountFromServer } from 'firebase/firestore';


// --- Helper function to handle Firebase errors ---
export const catchFirebaseError = (
  error: any,
  operationType?: string,
  path?: string
): never => {
  let finalErrorMessage: string;
  let finalErrorCode: string = "unknown-error";
  let isInitError = false;

  if (firebaseInitializationError) {
    isInitError = true;
    finalErrorMessage = `Firebase initialization error: ${firebaseInitializationError.message || 'No message available.'}`;
    finalErrorCode = (firebaseInitializationError as any).code || "firebase-init-failure";
    if (error && error.message && error.message !== firebaseInitializationError.message) {
      finalErrorMessage += ` | Original operation error: ${error.message}`;
      if ((error as any).code && (error as any).code !== finalErrorCode) {
        finalErrorCode += ` / op-${(error as any).code}`;
      }
    } else if (error && typeof error === 'string' && error !== firebaseInitializationError.message) {
      finalErrorMessage += ` | Original operation error: ${error}`;
    }
  } else if (error instanceof Error) {
    finalErrorMessage = error.message || "Error object with no message property.";
    finalErrorCode = (error as any).code || 'error-instance-no-code';
  } else if (error && typeof error.message === 'string') {
    finalErrorMessage = error.message;
    finalErrorCode = (error as any).code || 'custom-object-no-code';
  } else if (typeof error === 'string' && error.length > 0) {
    finalErrorMessage = error;
  } else {
    finalErrorMessage = "An unexpected or undefined error occurred during the Firebase operation.";
    finalErrorCode = "undefined-or-malformed-error";
  }

  let logMessage = `Firebase Operation Error: ${finalErrorMessage} (Code: ${finalErrorCode})`;
  if (operationType || path) {
    logMessage += ` [Operation: ${operationType || 'N/A'}, Path: ${path || 'N/A'}]`;
  }
  if (isInitError) {
    logMessage += ` [Note: This may be due to an earlier Firebase initialization failure.]`;
  }

  console.error(logMessage);
  if (error && error !== firebaseInitializationError) {
    console.error("Original error object passed to catchFirebaseError:", error);
  } else if (firebaseInitializationError && !error) {
    console.error("Firebase Initialization Error details:", firebaseInitializationError);
  }

  const newError = new Error(logMessage);
  (newError as any).originalCode = finalErrorCode;
  (newError as any).isInitializationError = isInitError;
  
  if (isInitError) {
    (newError as any).originalError = firebaseInitializationError;
  } else if (error) {
     try {
      (newError as any).originalError = error;
    } catch (e) {
      (newError as any).originalError = "Could not attach original error (unserializable or circular).";
    }
  }
  
  throw newError;
};

// --- Helper function to ensure Firebase services are initialized ---
export function ensureFirestoreInitialized() {
  if (firebaseInitializationError) {
    throw new Error(`Firebase not initialized due to configuration or critical error: ${firebaseInitializationError.message}`);
  }
  if (!app) {
    throw new Error("Firebase app instance is not available. Initialization likely failed.");
  }
  if (!firebaseAuthInstance) {
    throw new Error("Firebase Auth instance is not available. Initialization likely failed or Auth service is misconfigured.");
  }
  if (!firestoreInstance) {
    throw new Error("Firebase Firestore instance is not available. Initialization likely failed or Firestore service is misconfigured.");
  }
}


export const batchDeleteCollection = async (
  userId: string,
  collectionName: string,
  batchSize: number = 200
): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!firestoreInstance) throw new Error("Firestore is not initialized.");
  if (!userId) throw new Error("User ID is required for batch deletion.");

  const collectionPath = `users/${userId}/${collectionName}`;
  const collectionRef = collection(firestoreInstance, collectionPath);
  let deletedCount = 0;
  let lastSnapshot = null;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const constraints: QueryConstraint[] = [limit(batchSize)];
      
      const q = query(collectionRef, ...constraints);
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        break; 
      }

      const batch = writeBatch(firestoreInstance);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        deletedCount++;
      });
      await batch.commit();

      if (snapshot.docs.length < batchSize) {
        break; 
      }
      // Not using startAfter for simplicity here, as re-querying with limit will get the next batch
      // unless collection is extremely large and deletes are slow, causing overlaps.
      // For very large collections, proper pagination with startAfter is more robust.
      lastSnapshot = snapshot.docs[snapshot.docs.length - 1];
    }
    return { deletedCount };
  } catch (error: any) {
    console.error(`Error during batch delete of ${collectionPath}:`, error);
    throw catchFirebaseError(error, 'batchDeleteCollection', collectionPath);
  }
};
