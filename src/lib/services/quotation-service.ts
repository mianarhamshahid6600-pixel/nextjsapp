

import type { Quotation, QuotationItem, QuotationStatus, ActivityLogEntry, AppSettings, Customer, DashboardPeriod } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { db } from '@/lib/firebase/clientApp';
import {
    collection, doc, getDocs, setDoc, query, orderBy, Timestamp,
    writeBatch, runTransaction, serverTimestamp, addDoc, getDoc, where
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { getCustomerByIdForUser } from './customer-service';
import { formatCurrency } from '../currency-utils';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

const QUOTATIONS_COLLECTION = "quotations";

export const addQuotationForUser = async (
    userId: string,
    quotationData: Omit<Quotation, 'id' | 'numericQuotationId' | 'status' | 'createdAt' | 'lastUpdatedAt' | 'customerDetails'> & {
        customerName: string;
        customerId?: string;
        items: Array<Omit<QuotationItem, 'itemSubtotal' | 'itemDiscountAmount' | 'priceAfterItemDiscount'| 'itemTaxAmount' | 'itemTotal'>>
    }
): Promise<{ newQuotation: Quotation; activityEntry: ActivityLogEntry }> => {
    ensureFirestoreInitialized();
    if (!userId) throw new Error("User ID is required to add a quotation.");
    if (!db) throw new Error("Firestore is not initialized.");
    if (!quotationData.customerName.trim()) throw new Error("Customer Name is required.");
    if (!quotationData.items || quotationData.items.length === 0) throw new Error("At least one item is required for a quotation.");

    try {
        const appSettings = await getAppSettingsFromFirestore(userId);
        const nextNumericQuotationId = (appSettings.lastQuotationNumericId || 0) + 1;

        let customerForDetailsSnapshot: Partial<Customer> | undefined = undefined;
        if (quotationData.customerId) {
            customerForDetailsSnapshot = await getCustomerByIdForUser(userId, quotationData.customerId);
        }

        const quotationsCollectionRef = collection(db, `users/${userId}/${QUOTATIONS_COLLECTION}`);
        const newQuotationRef = doc(quotationsCollectionRef);

        const now = new Date().toISOString();

        const processedItems: QuotationItem[] = quotationData.items.map(item => {
            const itemSubtotal = item.quantity * item.salePrice;
            const itemDiscountAmount = itemSubtotal * (item.discountPercentage / 100);
            const priceAfterItemDiscount = itemSubtotal - itemDiscountAmount;
            const itemTaxAmount = priceAfterItemDiscount * (item.taxPercentage / 100);
            const itemTotal = priceAfterItemDiscount + itemTaxAmount;
            return {
                ...item,
                name: item.name,
                itemSubtotal,
                itemDiscountAmount,
                priceAfterItemDiscount,
                itemTaxAmount,
                itemTotal,
            };
        });

        const subTotal = processedItems.reduce((sum, item) => sum + item.itemSubtotal, 0);
        const totalItemDiscountAmount = processedItems.reduce((sum, item) => sum + item.itemDiscountAmount, 0);
        const totalItemTaxAmount = processedItems.reduce((sum, item) => sum + item.itemTaxAmount, 0);

        const priceAfterItemLevelAdjustments = subTotal - totalItemDiscountAmount + totalItemTaxAmount;
        const priceAfterOverallDiscount = priceAfterItemLevelAdjustments - (quotationData.overallDiscountAmount || 0);
        const grandTotal = priceAfterOverallDiscount + (quotationData.overallTaxAmount || 0) + (quotationData.shippingCharges || 0) + (quotationData.extraCosts || 0);


        const quotationObjectForFirestore: Record<string, any> = {
            numericQuotationId: nextNumericQuotationId,
            customerName: quotationData.customerName.trim(),
            quoteDate: quotationData.quoteDate,
            validTillDate: quotationData.validTillDate,
            items: processedItems,
            subTotal: subTotal,
            totalItemDiscountAmount: totalItemDiscountAmount,
            totalItemTaxAmount: totalItemTaxAmount,
            overallDiscountAmount: quotationData.overallDiscountAmount || 0,
            overallTaxAmount: quotationData.overallTaxAmount || 0,
            shippingCharges: quotationData.shippingCharges || 0,
            extraCosts: quotationData.extraCosts || 0,
            grandTotal: grandTotal,
            status: "Draft", 
            createdAt: serverTimestamp(),
            lastUpdatedAt: serverTimestamp(),
        };

        if (quotationData.customerId) {
            quotationObjectForFirestore.customerId = quotationData.customerId;
        }
        if (customerForDetailsSnapshot) {
            const details: any = {};
            if (customerForDetailsSnapshot.email) details.email = customerForDetailsSnapshot.email;
            if (customerForDetailsSnapshot.phone) details.phone = customerForDetailsSnapshot.phone;
            if (customerForDetailsSnapshot.address) details.address = customerForDetailsSnapshot.address;
            if ((customerForDetailsSnapshot as any).companyName) details.companyName = (customerForDetailsSnapshot as any).companyName;
            
            if (Object.keys(details).length > 0) {
                quotationObjectForFirestore.customerDetails = details;
            }
        }
        if (quotationData.termsAndConditions && quotationData.termsAndConditions.trim()) {
            quotationObjectForFirestore.termsAndConditions = quotationData.termsAndConditions.trim();
        }
        if (quotationData.paymentMethods && quotationData.paymentMethods.trim()) {
            quotationObjectForFirestore.paymentMethods = quotationData.paymentMethods.trim();
        }
        if (quotationData.notes && quotationData.notes.trim()) {
            quotationObjectForFirestore.notes = quotationData.notes.trim();
        }


        await setDoc(newQuotationRef, quotationObjectForFirestore);
        await updateAppSettingsInFirestore(userId, appSettings, { lastQuotationNumericId: nextNumericQuotationId });
        
        const newQuotation: Quotation = {
            id: newQuotationRef.id,
            numericQuotationId: quotationObjectForFirestore.numericQuotationId,
            customerName: quotationObjectForFirestore.customerName,
            quoteDate: quotationData.quoteDate, 
            validTillDate: quotationData.validTillDate,
            items: processedItems,
            subTotal: quotationObjectForFirestore.subTotal,
            totalItemDiscountAmount: quotationObjectForFirestore.totalItemDiscountAmount,
            totalItemTaxAmount: quotationObjectForFirestore.totalItemTaxAmount,
            overallDiscountAmount: quotationObjectForFirestore.overallDiscountAmount,
            overallTaxAmount: quotationObjectForFirestore.overallTaxAmount,
            shippingCharges: quotationObjectForFirestore.shippingCharges,
            extraCosts: quotationObjectForFirestore.extraCosts,
            grandTotal: quotationObjectForFirestore.grandTotal,
            status: quotationObjectForFirestore.status,
            createdAt: now, 
            lastUpdatedAt: now,
        };

        // Assign optional properties only if they exist in quotationObjectForFirestore
        if (quotationObjectForFirestore.customerId) newQuotation.customerId = quotationObjectForFirestore.customerId;
        if (quotationObjectForFirestore.customerDetails) newQuotation.customerDetails = quotationObjectForFirestore.customerDetails;
        if (quotationObjectForFirestore.termsAndConditions) newQuotation.termsAndConditions = quotationObjectForFirestore.termsAndConditions;
        if (quotationObjectForFirestore.paymentMethods) newQuotation.paymentMethods = quotationObjectForFirestore.paymentMethods;
        if (quotationObjectForFirestore.notes) newQuotation.notes = quotationObjectForFirestore.notes;


        const activityDesc = `New Quotation #${nextNumericQuotationId} created for ${newQuotation.customerName}. Status: Draft. Total: ${formatCurrency(newQuotation.grandTotal, appSettings.currency)}.`;
        const activityEntry = await generateActivityEntryForUser(userId, {
            type: "QUOTATION_CREATED",
            description: activityDesc,
            details: {
                quotationId: newQuotationRef.id,
                numericQuotationId: nextNumericQuotationId,
                customerName: newQuotation.customerName,
                grandTotal: newQuotation.grandTotal,
                status: "Draft"
            }
        });

        return {
            newQuotation,
            activityEntry
        };

    } catch (error) {
        return catchFirebaseError(error, 'addQuotationForUser', `users/${userId}/${QUOTATIONS_COLLECTION}`);
    }
};

export const updateQuotationForUser = async (
    userId: string,
    quotationId: string,
    updateData: Partial<Omit<Quotation, 'id' | 'numericQuotationId' | 'createdAt' | 'lastUpdatedAt'>> & { items?: Array<Omit<QuotationItem, 'itemSubtotal' | 'itemDiscountAmount' | 'priceAfterItemDiscount'| 'itemTaxAmount' | 'itemTotal'>> }
): Promise<{ updatedQuotation: Quotation; activityEntry: ActivityLogEntry | null }> => {
    ensureFirestoreInitialized();
    if (!userId || !quotationId) throw new Error("User ID and Quotation ID are required.");
    if (!db) throw new Error("Firestore is not initialized.");

    const quotationDocRef = doc(db, `users/${userId}/${QUOTATIONS_COLLECTION}`, quotationId);

    try {
        const existingQuotationSnap = await getDoc(quotationDocRef);
        if (!existingQuotationSnap.exists()) {
            throw new Error("Quotation not found.");
        }
        const existingQuotation = existingQuotationSnap.data() as Quotation;
        const appSettings = await getAppSettingsFromFirestore(userId);


        let customerForDetailsSnapshot: Partial<Customer> | undefined = undefined;
        if (updateData.customerId) {
            customerForDetailsSnapshot = await getCustomerByIdForUser(userId, updateData.customerId);
        } else if (existingQuotation.customerId && updateData.customerId === '') { 
            // Case where customerId is being explicitly cleared
        } else if (existingQuotation.customerId) {
            // If customerId is not in updateData but exists, fetch existing for details
            customerForDetailsSnapshot = await getCustomerByIdForUser(userId, existingQuotation.customerId);
        }


        const itemsToProcess = updateData.items || existingQuotation.items;
        const processedItems: QuotationItem[] = itemsToProcess.map(item => {
            // If item already has calculated fields (e.g., from UI state), use them.
            if ('itemSubtotal' in item && 'itemDiscountAmount' in item && 'itemTaxAmount' in item && 'itemTotal' in item) {
                return item as QuotationItem;
            }
            // Otherwise, calculate them
            const itemSubtotal = item.quantity * item.salePrice;
            const itemDiscountAmount = itemSubtotal * (item.discountPercentage / 100);
            const priceAfterItemDiscount = itemSubtotal - itemDiscountAmount;
            const itemTaxAmount = priceAfterItemDiscount * (item.taxPercentage / 100);
            const itemTotal = priceAfterItemDiscount + itemTaxAmount;
            return {
                ...item,
                name: item.name, // Ensure name is carried over
                itemSubtotal,
                itemDiscountAmount,
                priceAfterItemDiscount,
                itemTaxAmount,
                itemTotal,
            };
        });

        const subTotal = processedItems.reduce((sum, item) => sum + item.itemSubtotal, 0);
        const totalItemDiscountAmount = processedItems.reduce((sum, item) => sum + item.itemDiscountAmount, 0);
        const totalItemTaxAmount = processedItems.reduce((sum, item) => sum + item.itemTaxAmount, 0);

        const overallDiscount = updateData.overallDiscountAmount !== undefined ? updateData.overallDiscountAmount : existingQuotation.overallDiscountAmount;
        const overallTax = updateData.overallTaxAmount !== undefined ? updateData.overallTaxAmount : existingQuotation.overallTaxAmount;
        const shipping = updateData.shippingCharges !== undefined ? updateData.shippingCharges : existingQuotation.shippingCharges;
        const extraCostsVal = updateData.extraCosts !== undefined ? updateData.extraCosts : existingQuotation.extraCosts;

        const priceAfterItemLevelAdjustments = subTotal - totalItemDiscountAmount + totalItemTaxAmount;
        const priceAfterOverallDiscount = priceAfterItemLevelAdjustments - overallDiscount;
        const grandTotal = priceAfterOverallDiscount + overallTax + shipping + extraCostsVal;

        const firestoreUpdatePayload: Record<string, any> = {};

        // Copy all defined properties from updateData to firestoreUpdatePayload
        for (const key in updateData) {
            if (Object.prototype.hasOwnProperty.call(updateData, key)) {
                const typedKey = key as keyof typeof updateData;
                if (updateData[typedKey] !== undefined) {
                    firestoreUpdatePayload[typedKey] = updateData[typedKey];
                }
            }
        }
        
        firestoreUpdatePayload.items = processedItems;
        firestoreUpdatePayload.subTotal = subTotal;
        firestoreUpdatePayload.totalItemDiscountAmount = totalItemDiscountAmount;
        firestoreUpdatePayload.totalItemTaxAmount = totalItemTaxAmount;
        firestoreUpdatePayload.overallDiscountAmount = overallDiscount;
        firestoreUpdatePayload.overallTaxAmount = overallTax;
        firestoreUpdatePayload.shippingCharges = shipping;
        firestoreUpdatePayload.extraCosts = extraCostsVal;
        firestoreUpdatePayload.grandTotal = grandTotal;
        firestoreUpdatePayload.lastUpdatedAt = serverTimestamp();

        if (updateData.customerName) firestoreUpdatePayload.customerName = updateData.customerName.trim();
        
        // Handle customerId and customerDetails
        if (updateData.customerId === '') { // Explicitly clearing customerId
            firestoreUpdatePayload.customerId = null; // Or FieldValue.delete() if you prefer
            firestoreUpdatePayload.customerDetails = null; // Or FieldValue.delete()
        } else if (customerForDetailsSnapshot) {
             const details: any = {};
             if (customerForDetailsSnapshot.email) details.email = customerForDetailsSnapshot.email;
             if (customerForDetailsSnapshot.phone) details.phone = customerForDetailsSnapshot.phone;
             if (customerForDetailsSnapshot.address) details.address = customerForDetailsSnapshot.address;
             if ((customerForDetailsSnapshot as any).companyName) details.companyName = (customerForDetailsSnapshot as any).companyName; // Assuming companyName might be on Customer
             if (Object.keys(details).length > 0) firestoreUpdatePayload.customerDetails = details;
             else firestoreUpdatePayload.customerDetails = null; // No details to set
        } else if (updateData.customerName && !updateData.customerId && updateData.customerId !== '') { // Manual customer name, customerId not touched or set
            firestoreUpdatePayload.customerDetails = null; // Clear details if only manual name and no ID change
        }


        await setDoc(quotationDocRef, firestoreUpdatePayload, { merge: true });

        const updatedQuotationSnap = await getDoc(quotationDocRef);
        const updatedQuotationData = updatedQuotationSnap.data();
        // Construct the return object carefully to reflect actual stored data + server timestamps
        const updatedQuotation: Quotation = {
            id: quotationId,
            numericQuotationId: existingQuotation.numericQuotationId, // Retain original numeric ID
            ...updatedQuotationData,
             // Safely convert Timestamps to ISO strings for dates
             lastUpdatedAt: updatedQuotationData?.lastUpdatedAt instanceof Timestamp 
                ? updatedQuotationData?.lastUpdatedAt.toDate().toISOString() 
                : new Date().toISOString(), // Fallback if somehow missing
             createdAt: existingQuotation.createdAt instanceof Timestamp 
                ? existingQuotation.createdAt.toDate().toISOString() 
                : (existingQuotation.createdAt || new Date().toISOString()), // Fallback for createdAt
             quoteDate: updatedQuotationData?.quoteDate instanceof Timestamp 
                ? updatedQuotationData?.quoteDate.toDate().toISOString()
                : (updatedQuotationData?.quoteDate || existingQuotation.quoteDate),
             validTillDate: updatedQuotationData?.validTillDate instanceof Timestamp
                ? updatedQuotationData?.validTillDate.toDate().toISOString()
                : (updatedQuotationData?.validTillDate || existingQuotation.validTillDate),
        } as Quotation;


        let activityEntry: ActivityLogEntry | null = null;
        let activityDescription = `Quotation #${existingQuotation.numericQuotationId} for ${updatedQuotation.customerName} updated.`;
        const changes: string[] = [];

        if (updateData.status && updateData.status !== existingQuotation.status) {
            changes.push(`Status changed from ${existingQuotation.status} to ${updateData.status}.`);
        }
        // Compare grandTotal with a small tolerance for floating point issues
        if (Math.abs(grandTotal - existingQuotation.grandTotal) > 0.001) { 
            changes.push(`Grand total changed from ${formatCurrency(existingQuotation.grandTotal, appSettings.currency)} to ${formatCurrency(grandTotal, appSettings.currency)}.`);
        }
        // Add more change detection here if needed, e.g., for customer name change


        if (changes.length > 0) {
            activityDescription += " " + changes.join(" ");
             activityEntry = await generateActivityEntryForUser(userId, {
                type: "QUOTATION_UPDATED",
                description: activityDescription,
                details: {
                    quotationId: quotationId,
                    numericQuotationId: existingQuotation.numericQuotationId,
                    customerName: updatedQuotation.customerName,
                    oldStatus: existingQuotation.status,
                    newStatus: updatedQuotation.status,
                    updatedFields: Object.keys(updateData) // Lists fields that were intended to be updated
                }
            });
        }

        return { updatedQuotation, activityEntry };

    } catch (error) {
        return catchFirebaseError(error, 'updateQuotationForUser', `users/${userId}/${QUOTATIONS_COLLECTION}/${quotationId}`);
    }
};


export const getQuotationsForUser = async (userId: string, period?: DashboardPeriod): Promise<Quotation[]> => {
    ensureFirestoreInitialized();
    if (!userId) return [];
    if (!db) throw new Error("Firestore is not initialized.");

    const quotationsCollectionRef = collection(db, `users/${userId}/${QUOTATIONS_COLLECTION}`);
    const queryConstraints = [orderBy("quoteDate", "desc")];

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
            queryConstraints.push(where("quoteDate", ">=", Timestamp.fromDate(startDate)));
            queryConstraints.push(where("quoteDate", "<=", Timestamp.fromDate(endDate)));
        }
    }
    
    const q = query(quotationsCollectionRef, ...queryConstraints);

    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Ensure dates are converted to ISO strings
                quoteDate: data.quoteDate instanceof Timestamp ? data.quoteDate.toDate().toISOString() : new Date(data.quoteDate).toISOString(),
                validTillDate: data.validTillDate instanceof Timestamp ? data.validTillDate.toDate().toISOString() : new Date(data.validTillDate).toISOString(),
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
                lastUpdatedAt: data.lastUpdatedAt instanceof Timestamp ? data.lastUpdatedAt.toDate().toISOString() : new Date(data.lastUpdatedAt).toISOString(),
            } as Quotation;
        });
    } catch (error) {
        return catchFirebaseError(error, 'getQuotationsForUser', `users/${userId}/${QUOTATIONS_COLLECTION}`);
    }
};

export const getQuotationByIdForUser = async (userId: string, quotationId: string): Promise<Quotation | undefined> => {
    ensureFirestoreInitialized();
    if (!userId || !quotationId) return undefined;
    if (!db) throw new Error("Firestore is not initialized.");

    const quotationDocRef = doc(db, `users/${userId}/${QUOTATIONS_COLLECTION}`, quotationId);
    try {
        const docSnap = await getDoc(quotationDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                quoteDate: data.quoteDate instanceof Timestamp ? data.quoteDate.toDate().toISOString() : new Date(data.quoteDate).toISOString(),
                validTillDate: data.validTillDate instanceof Timestamp ? data.validTillDate.toDate().toISOString() : new Date(data.validTillDate).toISOString(),
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
                lastUpdatedAt: data.lastUpdatedAt instanceof Timestamp ? data.lastUpdatedAt.toDate().toISOString() : new Date(data.lastUpdatedAt).toISOString(),
            } as Quotation;
        }
        return undefined;
    } catch (error) {
        return catchFirebaseError(error, 'getQuotationByIdForUser', `users/${userId}/${QUOTATIONS_COLLECTION}/${quotationId}`);
    }
};

async function batchUpdateQuotationStatuses(
  userId: string,
  updates: Array<{ id: string; oldStatus: QuotationStatus; customerName: string; numericQuotationId: number; grandTotal: number }>
): Promise<number> {
  ensureFirestoreInitialized();
  if (!db) throw new Error("Firestore is not initialized.");
  if (updates.length === 0) return 0;

  const appSettings = await getAppSettingsFromFirestore(userId); 

  const MAX_BATCH_OPERATIONS = 500; // Firestore batch limit
  let updatedCount = 0;

  for (let i = 0; i < updates.length; i += MAX_BATCH_OPERATIONS) {
    const batch = writeBatch(db);
    const currentBatchUpdates = updates.slice(i, i + MAX_BATCH_OPERATIONS);

    for (const update of currentBatchUpdates) {
      const quoteRef = doc(db, `users/${userId}/${QUOTATIONS_COLLECTION}`, update.id);
      batch.update(quoteRef, {
        status: "Expired",
        lastUpdatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    updatedCount += currentBatchUpdates.length;

    // Log activity for each updated quote in this batch
    for (const update of currentBatchUpdates) {
      const activityDesc = `Quotation #${update.numericQuotationId} for ${update.customerName} automatically expired. Status changed from ${update.oldStatus} to Expired.`;
      try {
        await generateActivityEntryForUser(userId, {
          type: "QUOTATION_STATUS_CHANGED",
          description: activityDesc,
          details: {
            quotationId: update.id,
            numericQuotationId: update.numericQuotationId,
            customerName: update.customerName,
            oldStatus: update.oldStatus,
            newStatus: "Expired",
            grandTotal: update.grandTotal,
            autoExpired: true,
          },
        });
      } catch (logError) {
        console.error(`Failed to log auto-expiration for quotation ${update.id}:`, logError);
        // Optionally, collect these errors and report them, but don't let logging stop the main process.
      }
    }
  }
  return updatedCount;
}


export async function syncExpiredQuotationStatusesOnLoad(userId: string): Promise<number> {
  ensureFirestoreInitialized();
  if (!db) throw new Error("Firestore is not initialized.");

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to the beginning of today for consistent date comparison

  const quotationsCollectionRef = collection(db, `users/${userId}/${QUOTATIONS_COLLECTION}`);
  // Query for quotations that are "Draft" or "Sent"
  const q = query(
    quotationsCollectionRef,
    where("status", "in", ["Draft", "Sent"])
    // We cannot effectively query where("validTillDate", "<", someTimestamp) without indexing
    // and ensuring validTillDate is stored as a Timestamp for direct comparison in query.
    // Client-side filtering after fetching "Draft" and "Sent" is a common pattern for this.
  );

  const querySnapshot = await getDocs(q);
  const updatesToPerform: Array<{ id: string; oldStatus: QuotationStatus; customerName: string; numericQuotationId: number; grandTotal: number }> = [];

  querySnapshot.forEach((docSnap) => {
    const quote = { id: docSnap.id, ...docSnap.data() } as Quotation;
    
    // Robustly parse validTillDate
    let validTillDateObj = new Date(quote.validTillDate);
    if (isNaN(validTillDateObj.getTime())) { // Check if date is invalid
      console.warn(`Invalid validTillDate encountered for quote ${quote.id}: ${quote.validTillDate}. Skipping auto-expiration check for this quote.`);
      return; // Skip this quote if its validTillDate is invalid
    }
    validTillDateObj.setHours(0,0,0,0); // Normalize to the start of its day

    // If the start of the validTillDate is before the start of today, it's expired
    if (validTillDateObj < today) {
      updatesToPerform.push({
        id: quote.id,
        oldStatus: quote.status,
        customerName: quote.customerName,
        numericQuotationId: quote.numericQuotationId,
        grandTotal: quote.grandTotal
      });
    }
  });

  if (updatesToPerform.length > 0) {
    return batchUpdateQuotationStatuses(userId, updatesToPerform);
  }
  return 0;
}
