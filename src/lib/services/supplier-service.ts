

import type { Supplier, ActivityLogEntry, AppSettings, BusinessTransaction, PurchaseInvoice } from '@/lib/data-types';
import { db } from '@/lib/firebase/clientApp';
import { 
    collection, doc, getDoc, setDoc, addDoc, deleteDoc, query, orderBy, getDocs, serverTimestamp, 
    writeBatch, Timestamp, runTransaction, where, increment
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { addBusinessTransactionForUser } from './financial-service';
import { formatCurrency } from '../currency-utils';
import { initialAppSettings } from '@/lib/data';


const SUPPLIERS_COLLECTION = "suppliers";
const PURCHASE_INVOICES_COLLECTION = "purchaseInvoices";

export const getSuppliersForUser = async (userId: string): Promise<Supplier[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");
  
  const suppliersCollectionRef = collection(db, `users/${userId}/${SUPPLIERS_COLLECTION}`);
  const q = query(suppliersCollectionRef, orderBy("name", "asc"));

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            dateAdded: data.dateAdded instanceof Timestamp ? data.dateAdded.toDate().toISOString() : new Date(data.dateAdded).toISOString(),
        } as Supplier;
    });
  } catch (error) {
    return catchFirebaseError(error, 'getSuppliersForUser', `users/${userId}/${SUPPLIERS_COLLECTION}`);
  }
};

export const getSupplierByIdForUser = async (userId: string, supplierId: string): Promise<Supplier | undefined> => {
  ensureFirestoreInitialized();
  if (!userId || !supplierId) return undefined;
  if (!db) throw new Error("Firestore is not initialized.");

  const supplierDocRef = doc(db, `users/${userId}/${SUPPLIERS_COLLECTION}`, supplierId);
  try {
    const docSnap = await getDoc(supplierDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { 
          id: docSnap.id, 
          ...data,
          dateAdded: data.dateAdded instanceof Timestamp ? data.dateAdded.toDate().toISOString() : new Date(data.dateAdded).toISOString(),
        } as Supplier;
    }
    return undefined;
  } catch (error) {
    return catchFirebaseError(error, 'getSupplierByIdForUser', `users/${userId}/${SUPPLIERS_COLLECTION}/${supplierId}`);
  }
};

export const addSupplierForUser = async (
  userId: string,
  supplierDetails: Omit<Supplier, 'id' | 'dateAdded' | 'currentBalance'>
): Promise<{ newSupplier: Supplier, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to add a supplier.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (!supplierDetails.name?.trim() && !supplierDetails.companyName?.trim()) {
    throw new Error("Either Supplier Name or Company Name is required.");
  }

  const suppliersCollectionRef = collection(db, `users/${userId}/${SUPPLIERS_COLLECTION}`);
  const newSupplierRef = doc(suppliersCollectionRef); // Auto-generate ID

  const openingBalance = supplierDetails.openingBalance || 0;
  const currentBalance = supplierDetails.openingBalanceType === 'owedToSupplier' ? openingBalance : -openingBalance;

  const initialData = {
    name: supplierDetails.name?.trim(),
    companyName: supplierDetails.companyName?.trim(),
    contactPerson: supplierDetails.contactPerson?.trim(),
    phone: supplierDetails.phone?.trim(),
    email: supplierDetails.email?.trim(),
    address: supplierDetails.address?.trim(),
    gstTaxNumber: supplierDetails.gstTaxNumber?.trim(),
    notes: supplierDetails.notes?.trim(),
    openingBalance: openingBalance,
    openingBalanceType: supplierDetails.openingBalanceType,
    currentBalance: currentBalance,
  };
  
  // Remove keys with undefined or empty string values before saving to Firestore
  const dataForFirestore = Object.entries(initialData).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      // @ts-ignore
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);


  try {
    const batch = writeBatch(db);
    batch.set(newSupplierRef, {...dataForFirestore, dateAdded: serverTimestamp()});

    // Increment totalSuppliers counter in appSettings
    const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
    batch.update(appSettingsRef, { totalSuppliers: increment(1) });
    
    await batch.commit();

    const newSupplierForReturn: Supplier = {
        id: newSupplierRef.id,
        ...dataForFirestore,
        dateAdded: new Date().toISOString(), // Optimistic date for return
    } as Supplier;
    
    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "NEW_SUPPLIER",
      description: `New supplier added: ${newSupplierForReturn.name || newSupplierForReturn.companyName}. Opening Balance: ${currentBalance.toFixed(2)}`,
      details: { supplierName: (newSupplierForReturn.name || newSupplierForReturn.companyName), supplierId: newSupplierRef.id, openingBalance: currentBalance }
    });
    return { newSupplier: newSupplierForReturn, activityEntry };
  } catch (error) {
    return catchFirebaseError(error, 'addSupplierForUser', `users/${userId}/${SUPPLIERS_COLLECTION}`);
  }
};

export const editSupplierForUser = async (
  userId: string,
  supplierId: string,
  updatedDetails: Partial<Omit<Supplier, 'id' | 'dateAdded' | 'currentBalance' | 'openingBalance' | 'openingBalanceType'>>
): Promise<{ updatedSupplier: Supplier, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to edit a supplier.");
  if (!db) throw new Error("Firestore is not initialized.");

  const supplierDocRef = doc(db, `users/${userId}/${SUPPLIERS_COLLECTION}`, supplierId);
  try {
    const supplierSnap = await getDoc(supplierDocRef);
    if (!supplierSnap.exists()) throw new Error("Supplier not found for update.");

    const currentData = supplierSnap.data() as Supplier;
    
    const updatePayload: Record<string, any> = {};
    // Filter out undefined values from updatedDetails to prevent Firestore errors
    for (const key in updatedDetails) {
        if (Object.prototype.hasOwnProperty.call(updatedDetails, key)) {
            // @ts-ignore
            const value = updatedDetails[key];
            if (value !== undefined) {
                 // @ts-ignore
                updatePayload[key] = typeof value === 'string' ? value.trim() : value;
            }
        }
    }
     // Ensure name or companyName is present if they are being modified
    if (updatePayload.name === "" && (updatePayload.companyName === "" || updatePayload.companyName === undefined) && !currentData.companyName && !currentData.name) {
        throw new Error("Either Supplier Name or Company Name must be provided.");
    }
     if (updatePayload.phone === "") {
        throw new Error("Phone number cannot be empty.");
    }


    await setDoc(supplierDocRef, updatePayload, { merge: true });
    const updatedSupplier: Supplier = { ...currentData, ...updatePayload, id: supplierId } as Supplier;
    
    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "SUPPLIER_UPDATE",
      description: `Supplier details updated for ${updatedSupplier.name || updatedSupplier.companyName}.`,
      details: { supplierName: (updatedSupplier.name || updatedSupplier.companyName), supplierId, updatedFields: Object.keys(updatedDetails) }
    });
    return { updatedSupplier, activityEntry };
  } catch (error) {
    return catchFirebaseError(error, 'editSupplierForUser', `users/${userId}/${SUPPLIERS_COLLECTION}/${supplierId}`);
  }
};

export const recordPaymentToSupplier = async (
    userId: string,
    supplierId: string,
    paymentAmount: number,
    paymentDate: Date,
    paymentMethod: string,
    reference?: string,
    transactionId?: string,
    notes?: string
): Promise<{ updatedSupplier: Supplier, activityEntry: ActivityLogEntry, businessTransaction: BusinessTransaction }> => {
    ensureFirestoreInitialized();
    if (!db) throw new Error("Firestore is not initialized.");
    if (!userId) throw new Error("User ID is required.");
    if (!supplierId) throw new Error("Supplier ID is required.");
    if (paymentAmount <= 0) throw new Error("Payment amount must be positive.");

    const supplierDocRef = doc(db, `users/${userId}/${SUPPLIERS_COLLECTION}`, supplierId);
    const appSettingsDocRef = doc(db, `users/${userId}/settings`, "app_config");

    try {
        let finalUpdatedSupplier: Supplier;
        let finalBusinessTransaction: BusinessTransaction;
        let finalActivityEntry: ActivityLogEntry;
        let appSettings: AppSettings;

        const openInvoicesQuery = query(
            collection(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`),
            where("supplierId", "==", supplierId),
            where("paymentStatus", "in", ["unpaid", "partially_paid"]),
            orderBy("invoiceDate", "asc")
        );

        await runTransaction(db, async (transaction) => {
            const supplierSnap = await transaction.get(supplierDocRef);
            if (!supplierSnap.exists()) throw new Error(`Supplier with ID ${supplierId} not found.`);
            const supplierData = supplierSnap.data() as Supplier;

            const appSettingsSnap = await transaction.get(appSettingsDocRef);
            appSettings = appSettingsSnap.exists() ? appSettingsSnap.data() as AppSettings : initialAppSettings;

            let paymentToApply = paymentAmount;

            // Apply payment to open invoices
            // This is a read outside the transaction which is normally not recommended for atomicity.
            // However, querying within a transaction is not supported. We fetch IDs first, then get/update them inside.
            // This is a common pattern for this limitation. The transaction.get() inside the loop ensures atomicity for each doc.
            const openInvoicesSnapshot = await getDocs(openInvoicesQuery);
            for (const invoiceDoc of openInvoicesSnapshot.docs) {
                if (paymentToApply <= 0) break;
                const invoiceRef = doc(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`, invoiceDoc.id);
                const invoiceSnap = await transaction.get(invoiceRef); // Re-read inside transaction
                if (!invoiceSnap.exists()) continue;

                const invoiceData = invoiceSnap.data() as PurchaseInvoice;
                const dueAmount = invoiceData.grandTotal - invoiceData.amountPaid;
                if (dueAmount <= 0) continue;

                const paymentForThisInvoice = Math.min(paymentToApply, dueAmount);
                const newAmountPaid = invoiceData.amountPaid + paymentForThisInvoice;
                
                let newStatus: 'paid' | 'partially_paid' | 'unpaid' = 'partially_paid';
                if (newAmountPaid >= invoiceData.grandTotal) {
                    newStatus = 'paid';
                }

                transaction.update(invoiceRef, { amountPaid: newAmountPaid, paymentStatus: newStatus });
                paymentToApply -= paymentForThisInvoice;
            }

            const newSupplierBalance = (supplierData.currentBalance || 0) - paymentAmount;
            transaction.update(supplierDocRef, { currentBalance: newSupplierBalance });

            const newBusinessCash = (appSettings.currentBusinessCash || 0) - paymentAmount;
            transaction.update(appSettingsDocRef, { currentBusinessCash: newBusinessCash, lastUpdated: serverTimestamp() });
            
            finalUpdatedSupplier = { ...supplierData, id: supplierId, currentBalance: newSupplierBalance };
        });
        
        // @ts-ignore - finalUpdatedSupplier is guaranteed to be set if transaction succeeds
        const supplierDisplayName = finalUpdatedSupplier.name || finalUpdatedSupplier.companyName || "Unknown Supplier";
        // @ts-ignore - appSettings is guaranteed to be set
        const currency = appSettings.currency || initialAppSettings.currency;

        finalBusinessTransaction = await addBusinessTransactionForUser(userId, {
            userId: userId,
            description: `Payment to supplier: ${supplierDisplayName}. Method: ${paymentMethod}. ${reference ? `Ref: ${reference}` : ''}`,
            type: 'supplier_payment',
            amount: -paymentAmount, // Negative as it's an outflow
            relatedDocumentId: supplierId,
            notes: notes || `Payment Transaction ID: ${transactionId || 'N/A'}`
        });
        
        finalActivityEntry = await generateActivityEntryForUser(userId, {
            type: "SUPPLIER_BALANCE_UPDATE",
            description: `Payment of ${formatCurrency(paymentAmount, currency)} made to ${supplierDisplayName}. Method: ${paymentMethod}. New balance: ${formatCurrency(finalUpdatedSupplier.currentBalance, currency)}.`,
            details: { 
                supplierName: supplierDisplayName, 
                supplierId, 
                paymentAmount, 
                paymentMethod,
                reference,
                transactionId,
                newBalance: finalUpdatedSupplier.currentBalance,
                businessTransactionId: finalBusinessTransaction.id
            }
        });
        // @ts-ignore
        return { updatedSupplier: finalUpdatedSupplier, activityEntry: finalActivityEntry, businessTransaction: finalBusinessTransaction };

    } catch (error) {
        return catchFirebaseError(error, 'recordPaymentToSupplier', `users/${userId}/suppliers/${supplierId}`);
    }
};


export const deleteSupplierFromStorageForUser = async (
  userId: string,
  supplierIdToDelete: string
): Promise<{ deletedSupplierName: string, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to delete a supplier.");
  if (!db) throw new Error("Firestore is not initialized.");

  const supplierDocRef = doc(db, `users/${userId}/${SUPPLIERS_COLLECTION}`, supplierIdToDelete);
  try {
    const supplierSnap = await getDoc(supplierDocRef);
    if (!supplierSnap.exists()) throw new Error("Supplier to delete not found.");
    
    const deletedSupplierName = supplierSnap.data().name || supplierSnap.data().companyName || "Unknown Supplier";
    
    const batch = writeBatch(db);
    batch.delete(supplierDocRef);
    
    // Decrement totalSuppliers counter in appSettings
    const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
    batch.update(appSettingsRef, { totalSuppliers: increment(-1) });

    await batch.commit();

    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "SUPPLIER_DELETE",
      description: `Supplier removed: ${deletedSupplierName}`,
      details: { supplierName: deletedSupplierName, supplierId: supplierIdToDelete }
    });
    return { deletedSupplierName, activityEntry };
  } catch (error) {
    return catchFirebaseError(error, 'deleteSupplierFromStorageForUser', `users/${userId}/${SUPPLIERS_COLLECTION}/${supplierIdToDelete}`);
  }
};

export const deleteAllSuppliersForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required to delete all suppliers.");
  try {
    const result = await batchDeleteCollection(userId, SUPPLIERS_COLLECTION);
    
    // Reset the counter in appSettings
    if (result.deletedCount > 0) {
        const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
        await setDoc(appSettingsRef, { totalSuppliers: 0 }, { merge: true });
    }
    
     await generateActivityEntryForUser(userId, {
      type: "SUPPLIER_DELETE",
      description: `All ${result.deletedCount} suppliers have been deleted.`,
      details: { action: "deleteAllSuppliers", count: result.deletedCount }
    });
    return result;
  } catch (error) {
    return catchFirebaseError(error, 'deleteAllSuppliersForUser', `users/${userId}/${SUPPLIERS_COLLECTION}`);
  }
};
