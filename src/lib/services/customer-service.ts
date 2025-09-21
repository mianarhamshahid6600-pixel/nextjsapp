

import type { Customer, ActivityLogEntry, DashboardPeriod, AppSettings } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { db } from '@/lib/firebase/clientApp';
import { 
    collection, doc, getDoc, setDoc, addDoc, deleteDoc, query, where, orderBy, getDocs, serverTimestamp, 
    writeBatch, runTransaction, Timestamp, increment 
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

const CUSTOMERS_COLLECTION = "customers";

export const getCustomersForUser = async (userId: string, period?: DashboardPeriod): Promise<Customer[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");
  
  const customersCollectionRef = collection(db, `users/${userId}/${CUSTOMERS_COLLECTION}`);
  let q = query(customersCollectionRef, orderBy("name", "asc"));

  if (period && period !== "all_time") {
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (period === "this_month") {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else if (period === "last_month") {
      const lastMonthDate = subMonths(now, 1);
      startDate = startOfMonth(lastMonthDate);
      endDate = endOfMonth(lastMonthDate);
    } else if (period === "this_year") {
      startDate = startOfYear(now);
      endDate = endOfYear(now);
    }

    if (startDate && endDate) {
        q = query(
            customersCollectionRef, 
            where("joinedDate", ">=", Timestamp.fromDate(startDate)),
            where("joinedDate", "<=", Timestamp.fromDate(endDate)),
            orderBy("joinedDate", "desc")
        );
    }
  }

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      joinedDate: doc.data().joinedDate instanceof Timestamp ? doc.data().joinedDate.toDate().toISOString() : new Date(doc.data().joinedDate).toISOString(),
    } as Customer));
  } catch (error) {
    return catchFirebaseError(error, 'getCustomersForUser', `users/${userId}/${CUSTOMERS_COLLECTION}`);
  }
};

export const getCustomerByIdForUser = async (userId: string, customerId: string): Promise<Customer | undefined> => {
  ensureFirestoreInitialized();
  if (!userId || !customerId) return undefined;
  if (!db) throw new Error("Firestore is not initialized.");

  const customerDocRef = doc(db, `users/${userId}/${CUSTOMERS_COLLECTION}`, customerId);
  try {
    const docSnap = await getDoc(customerDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { 
          id: docSnap.id, 
          ...data,
          joinedDate: data.joinedDate instanceof Timestamp ? data.joinedDate.toDate().toISOString() : new Date(data.joinedDate).toISOString(),
        } as Customer;
    }
    return undefined;
  } catch (error) {
    return catchFirebaseError(error, 'getCustomerByIdForUser', `users/${userId}/${CUSTOMERS_COLLECTION}/${customerId}`);
  }
};

export const addCustomerForUser = async (
  userId: string,
  customerDetails: Partial<Omit<Customer, 'id' | 'joinedDate'>>
): Promise<{ newCustomer: Customer, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to add a customer.");
  if (!db) throw new Error("Firestore is not initialized.");
   if (!customerDetails.phone?.trim()) {
    throw new Error("Phone Number is required.");
  }
  if (!customerDetails.name?.trim() && !customerDetails.companyName?.trim()) {
    throw new Error("Customer Name or Company Name is required.");
  }

  const newCustomerData: Partial<Customer> = {
    name: customerDetails.name?.trim() || "",
    phone: customerDetails.phone.trim(),
    email: customerDetails.email?.trim(),
    address: customerDetails.address?.trim(),
    companyName: customerDetails.companyName?.trim(),
    joinedDate: new Date().toISOString()
  };

  // Remove keys with undefined or empty string values before saving to Firestore
  const dataForFirestore = Object.entries(newCustomerData).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== '') {
      // @ts-ignore
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
  
  try {
    const docRef = await addDoc(collection(db, `users/${userId}/${CUSTOMERS_COLLECTION}`), {...dataForFirestore, joinedDate: serverTimestamp()});

    const newCustomer = {
        ...newCustomerData, // Use the pre-cleaned data for the return object
        id: docRef.id,
    } as Customer;

    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "NEW_CUSTOMER",
      description: `New customer registered: ${newCustomer.name || newCustomer.companyName} (ID: ${newCustomer.id})`,
      details: { customerName: newCustomer.name || newCustomer.companyName, customerId: newCustomer.id }
    });
    return { newCustomer, activityEntry };
  } catch (error) {
    return catchFirebaseError(error, 'addCustomerForUser', `users/${userId}/${CUSTOMERS_COLLECTION}`);
  }
};

export const editCustomerForUser = async (
  userId: string,
  customerId: string,
  updatedDetails: Partial<Omit<Customer, 'id' | 'joinedDate'>>
): Promise<{ updatedCustomer: Customer, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required.");
  if (!db) throw new Error("Firestore is not initialized.");
  
  const customerDocRef = doc(db, `users/${userId}/${CUSTOMERS_COLLECTION}`, customerId);
  try {
    const customerSnap = await getDoc(customerDocRef);
    if (!customerSnap.exists()) throw new Error("Customer not found.");

    const currentData = customerSnap.data() as Customer;
    
    // Create a clean payload, removing any keys with `undefined` values
    const updatePayload: Record<string, any> = {};
    for (const key in updatedDetails) {
        if (Object.prototype.hasOwnProperty.call(updatedDetails, key)) {
            const value = (updatedDetails as any)[key];
            if (value !== undefined) {
                updatePayload[key] = value;
            }
        }
    }
    
    await setDoc(customerDocRef, updatePayload, { merge: true });

    const updatedData = { ...currentData, ...updatePayload }; // Merge for optimistic return
    
    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "CUSTOMER_UPDATE",
      description: `Customer details updated for ${updatedData.name || updatedData.companyName}`,
      details: { customerName: updatedData.name || updatedData.companyName, customerId, updatedFields: Object.keys(updatePayload) }
    });
    return { updatedCustomer: { ...updatedData, id: customerId, joinedDate: currentData.joinedDate }, activityEntry }; // Keep original joinedDate
  } catch (error) {
    return catchFirebaseError(error, 'editCustomerForUser', `users/${userId}/${CUSTOMERS_COLLECTION}/${customerId}`);
  }
};

export const deleteCustomerFromStorageForUser = async (
  userId: string,
  customerIdToDelete: string
): Promise<{ deletedCustomerName: string, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (customerIdToDelete === "CUST_WALK_IN") {
    throw new Error("The default 'Walk-in Customer' cannot be deleted.");
  }

  const customerDocRef = doc(db, `users/${userId}/${CUSTOMERS_COLLECTION}`, customerIdToDelete);
  try {
    const customerSnap = await getDoc(customerDocRef);
    if (!customerSnap.exists()) throw new Error("Customer to delete not found.");
    
    const deletedCustomerName = customerSnap.data().name || customerSnap.data().companyName || "Unknown Customer";
    await deleteDoc(customerDocRef);
    
    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "CUSTOMER_DELETE",
      description: `Customer removed: ${deletedCustomerName}`,
      details: { customerName: deletedCustomerName, customerId: customerIdToDelete }
    });
    return { deletedCustomerName, activityEntry };
  } catch (error) {
    return catchFirebaseError(error, 'deleteCustomerFromStorageForUser', `users/${userId}/${CUSTOMERS_COLLECTION}/${customerIdToDelete}`);
  }
};

export const deleteAllCustomersForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required to delete all customers.");
  try {
    // Note: Walk-in customer should ideally be protected if it exists.
    // batchDeleteCollection needs to handle this or we filter results before passing.
    // For now, batchDeleteCollection deletes everything in the path.
    const result = await batchDeleteCollection(userId, CUSTOMERS_COLLECTION);
     await generateActivityEntryForUser(userId, {
      type: "CUSTOMER_DELETE",
      description: `All ${result.deletedCount} customers have been deleted.`,
      details: { action: "deleteAllCustomers", count: result.deletedCount }
    });
    return result;
  } catch (error) {
    return catchFirebaseError(error, 'deleteAllCustomersForUser', `users/${userId}/${CUSTOMERS_COLLECTION}`);
  }
};
