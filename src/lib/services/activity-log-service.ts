

import type { ActivityLogEntry } from '@/lib/data-types';
import { db } from '@/lib/firebase/clientApp';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';

const ACTIVITY_LOG_COLLECTION = "activityLog";

export const generateActivityEntryForUser = async (
  userId: string,
  activity: Omit<ActivityLogEntry, 'id' | 'timestamp'> & { timestamp?: any }
): Promise<ActivityLogEntry> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required for generating activity entry.");
  if (!db) throw new Error("Firestore is not initialized.");

  const activityLogCollectionRef = collection(db, `users/${userId}/${ACTIVITY_LOG_COLLECTION}`);
  
  // Deep clone activity.details if it exists to avoid modifying the original object
  // and remove any undefined properties from it.
  let cleanedDetails: any = undefined;
  if (activity.details && typeof activity.details === 'object' && activity.details !== null) {
    cleanedDetails = {}; // Initialize as an empty object
    for (const key in activity.details) {
      if (Object.prototype.hasOwnProperty.call(activity.details, key) && activity.details[key] !== undefined) {
        cleanedDetails[key] = activity.details[key];
      }
    }
  } else if (activity.details !== undefined) {
    // If details is not an object but is defined (e.g., a string, number), keep it as is
    cleanedDetails = activity.details;
  }

  const activityDataForFirestore = {
    ...activity,
    details: cleanedDetails, // Use the cleaned (or original if not an object/undefined) details
    timestamp: activity.timestamp || serverTimestamp(),
  };
  
  // Final check to remove top-level undefined properties from activityDataForFirestore itself
  // (excluding details, as it's handled, and timestamp which gets a server value)
  // This is a general safeguard.
  const finalActivityDataForFirestore: Record<string, any> = {};
  for (const key in activityDataForFirestore) {
    if (Object.prototype.hasOwnProperty.call(activityDataForFirestore, key)) {
      // @ts-ignore
      if (activityDataForFirestore[key] !== undefined) {
        // @ts-ignore
        finalActivityDataForFirestore[key] = activityDataForFirestore[key];
      }
    }
  }


  try {
    // @ts-ignore // Firestore types can be tricky with serverTimestamp
    const docRef = await addDoc(activityLogCollectionRef, finalActivityDataForFirestore);
    
    // Resolve serverTimestamp for optimistic return (basic approach)
    let resolvedTimestamp: string;
    // @ts-ignore
    if (finalActivityDataForFirestore.timestamp && typeof finalActivityDataForFirestore.timestamp.toDate === 'function') { 
        // @ts-ignore
        resolvedTimestamp = (finalActivityDataForFirestore.timestamp as Timestamp).toDate().toISOString();
    } else if (activity.timestamp instanceof Date) { 
        resolvedTimestamp = activity.timestamp.toISOString();
    } else {
        resolvedTimestamp = new Date().toISOString(); // Fallback
    }

    return {
      id: docRef.id,
      ...(finalActivityDataForFirestore as Omit<ActivityLogEntry, 'id' | 'timestamp' | 'details'>), // Cast after cleaning
      details: cleanedDetails, // explicitly use cleanedDetails here
      timestamp: resolvedTimestamp,
    } as ActivityLogEntry;
  } catch (error) {
    return catchFirebaseError(error, 'generateActivityEntryForUser', `users/${userId}/${ACTIVITY_LOG_COLLECTION}`);
  }
};

export const getActivityLogForUser = async (userId: string, limitCount: number = 50): Promise<ActivityLogEntry[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");
  
  const activityLogCollectionRef = collection(db, `users/${userId}/${ACTIVITY_LOG_COLLECTION}`);
  const q = query(activityLogCollectionRef, orderBy("timestamp", "desc"), limit(limitCount));

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date(data.timestamp).toISOString(), // Handle Firestore Timestamp
      } as ActivityLogEntry;
    });
  } catch (error) {
    return catchFirebaseError(error, 'getActivityLogForUser', `users/${userId}/${ACTIVITY_LOG_COLLECTION}`);
  }
};

export const clearActivityLogForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to clear activity log.");
  
  try {
    return await batchDeleteCollection(userId, ACTIVITY_LOG_COLLECTION);
  } catch (error) {
     return catchFirebaseError(error, 'clearActivityLogForUser', `users/${userId}/${ACTIVITY_LOG_COLLECTION}`);
  }
};
