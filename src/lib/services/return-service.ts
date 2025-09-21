

// src/lib/services/return-service.ts
import type { Return, ReturnItem, AppSettings, ActivityLogEntry, BusinessTransaction, Product, Sale, FinancialTransactionType, DashboardPeriod } from '@/lib/data-types';
import { db } from '@/lib/firebase/clientApp';
import { collection, doc, writeBatch, serverTimestamp, Timestamp, runTransaction, getDocs, query, orderBy, where } from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { addBusinessTransactionForUser } from './financial-service';
import { formatCurrency } from '../currency-utils';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';


const RETURNS_COLLECTION = "returns";
const PRODUCTS_COLLECTION = "products";

export interface ProcessReturnInput {
  userId: string;
  originalSaleId?: string; // Firestore ID
  originalNumericSaleId?: number;
  customerName: string;
  customerId?: string;
  itemsToReturn: Array<ReturnItem & { originalSalePrice: number; productId: string; productCode?: string; productName: string }>;
  overallReason: string;
  refundMethod?: string;
  adjustmentAmount: number;
  adjustmentType: 'deduct' | 'add';
  notes?: string;
}

export const addReturnForUser = async (
  input: ProcessReturnInput
): Promise<{ newReturn: Return; activityEntries: ActivityLogEntry[]; businessTransaction: BusinessTransaction }> => {
  const { userId, originalSaleId, originalNumericSaleId, customerId, customerName, itemsToReturn, overallReason, refundMethod, adjustmentAmount, adjustmentType, notes } = input;

  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (itemsToReturn.length === 0) throw new Error("At least one item must be selected for return.");

  const activityEntries: ActivityLogEntry[] = [];
  let newReturnDocumentForOptimisticReturn: Return;

  try {
    const { finalReturn, finalBusinessTransaction } = await runTransaction(db, async (transaction) => {
      const appSettings = await getAppSettingsFromFirestore(userId);
      const nextNumericReturnId = (appSettings.lastReturnNumericId || 0) + 1;

      const returnSubtotal = itemsToReturn.reduce((sum, item) => sum + (item.quantityReturned * item.originalSalePrice), 0);
      const netRefundAmount = adjustmentType === 'add'
        ? returnSubtotal + adjustmentAmount
        : Math.max(0, returnSubtotal - adjustmentAmount);

      const returnItemsForDoc: ReturnItem[] = [];

      // 1. Update product stock for each returned item
      for (const item of itemsToReturn) {
        let stockWasUpdated: boolean | null = null;
        if (item.productId === "MANUAL_ENTRY") {
            const manualItemActivityDesc = `Manual item "${item.productName}" (qty: ${item.quantityReturned}) included in return #${nextNumericReturnId}. No stock updated.`;
            activityEntries.push(await generateActivityEntryForUser(userId, {
                type: "RETURN_PROCESSED", description: manualItemActivityDesc,
                details: { productName: item.productName, quantityReturned: item.quantityReturned, returnId: nextNumericReturnId, manualItem: true }
            }));
            stockWasUpdated = null; // Explicitly null for manual items
        } else {
            const productDocRef = doc(db, `users/${userId}/${PRODUCTS_COLLECTION}`, item.productId);
            const productSnap = await transaction.get(productDocRef);
            if (!productSnap.exists()) {
              console.warn(`Product ${item.productName} (ID: ${item.productId}) not found during return transaction for return #${nextNumericReturnId}. Stock not updated for this item.`);
              activityEntries.push(await generateActivityEntryForUser(userId, {
                  type: "RETURN_PROCESSED",
                  description: `Product "${item.productName}" (ID: ${item.productId}) not found in inventory during return #${nextNumericReturnId}. Stock not restocked.`,
                  details: { productName: item.productName, productId: item.productId, returnId: nextNumericReturnId, stockUpdateSkipped: true }
              }));
              stockWasUpdated = false; // Stock update skipped
            } else {
              const productData = productSnap.data() as Product;
              const newStock = productData.stock + item.quantityReturned;
              transaction.update(productDocRef, { stock: newStock, lastUpdated: serverTimestamp() });
              stockWasUpdated = true;

              const stockActDesc = `Stock for ${item.productName} (Code: ${item.productCode || 'N/A'}) increased by ${item.quantityReturned} due to return #${nextNumericReturnId}. New stock: ${newStock}.`;
              activityEntries.push(await generateActivityEntryForUser(userId, {
                type: "STOCK_ADD", description: stockActDesc,
                details: {
                  productName: item.productName, productCode: item.productCode, productId: item.productId,
                  oldStock: productData.stock, newStock: newStock, quantityChanged: item.quantityReturned,
                  returnId: nextNumericReturnId, reason: item.returnReason || overallReason
                }
              }));
            }
        }
        returnItemsForDoc.push({
          productId: item.productId,
          productCode: item.productCode === undefined ? null : item.productCode,
          productName: item.productName,
          quantityReturned: item.quantityReturned,
          originalSalePrice: item.originalSalePrice,
          returnReason: item.returnReason || overallReason,
          itemSubtotal: item.quantityReturned * item.originalSalePrice,
          stockUpdated: stockWasUpdated,
        });
      }

      // 2. Update AppSettings (numeric ID counter and business cash)
      const updatedAppSettings: Partial<AppSettings> = {
        lastReturnNumericId: nextNumericReturnId,
        currentBusinessCash: (appSettings.currentBusinessCash || 0) - netRefundAmount,
      };
      const appSettingsDocRef = doc(db, `users/${userId}/settings`, "app_config");
      transaction.set(appSettingsDocRef, updatedAppSettings, { merge: true });

      // 3. Prepare the BusinessTransaction for the cash movement
      const businessTxForReturn: Omit<BusinessTransaction, 'id' | 'date'> = {
        userId: userId,
        description: `Refund for Sale Return #${nextNumericReturnId} (Inv: ${originalNumericSaleId || 'N/A'}) to ${customerName}.`,
        type: 'sale_return',
        amount: -netRefundAmount, 
        relatedDocumentId: `RETURN_${nextNumericReturnId}`, 
        notes: `Reason: ${overallReason}. Items: ${itemsToReturn.map(i => `${i.productName} (x${i.quantityReturned})`).join(', ')}. Adjustment: ${adjustmentType === 'add' ? '+' : '-'}${formatCurrency(adjustmentAmount, appSettings.currency)}. ${notes && notes.trim() ? `Return Notes: ${notes.trim()}` : ''}`.trim(),
      };

      // 4. Prepare the Return document data
      const returnsCollectionRef = collection(db, `users/${userId}/${RETURNS_COLLECTION}`);
      const newReturnRef = doc(returnsCollectionRef);

      const returnDataForFirestore: { [key: string]: any } = { 
        numericReturnId: nextNumericReturnId,
        customerName: customerName, 
        items: returnItemsForDoc,
        returnDate: serverTimestamp(),
        reason: overallReason, 
        subtotalReturnedAmount: returnSubtotal,
        adjustmentAmount: adjustmentAmount,
        adjustmentType: adjustmentType,
        netRefundAmount: netRefundAmount,
        createdAt: serverTimestamp(),
      };
      
      if (originalSaleId !== undefined) returnDataForFirestore.originalSaleId = originalSaleId; else returnDataForFirestore.originalSaleId = null;
      if (originalNumericSaleId !== undefined) returnDataForFirestore.originalNumericSaleId = originalNumericSaleId; else returnDataForFirestore.originalNumericSaleId = null;
      if (customerId !== undefined) returnDataForFirestore.customerId = customerId; else returnDataForFirestore.customerId = null;
      if (refundMethod !== undefined && refundMethod.trim() !== "") returnDataForFirestore.refundMethod = refundMethod; else returnDataForFirestore.refundMethod = null;
      if (notes && notes.trim()) returnDataForFirestore.notes = notes.trim(); else returnDataForFirestore.notes = null;


      transaction.set(newReturnRef, returnDataForFirestore);
      
      newReturnDocumentForOptimisticReturn = {
        id: newReturnRef.id,
        ...returnDataForFirestore, 
        returnDate: new Date().toISOString(), 
        createdAt: new Date().toISOString(),  
      } as Return;


      return {
          finalReturn: newReturnDocumentForOptimisticReturn,
          finalBusinessTransaction: { ...businessTxForReturn, relatedDocumentId: newReturnRef.id } 
      };
    });

    // @ts-ignore 
    const newReturnDoc = finalReturn as Return;
    // @ts-ignore 
    const finalBusinessTxData = finalBusinessTransaction as Omit<BusinessTransaction, 'id'|'date'>;


    const createdBusinessTransaction = await addBusinessTransactionForUser(userId, finalBusinessTxData);

    const currentAppSettings = await getAppSettingsFromFirestore(userId);
    const mainReturnActivityDesc = `Return #${newReturnDoc.numericReturnId} processed for ${newReturnDoc.customerName || 'N/A'}. Net refund: ${formatCurrency(newReturnDoc.netRefundAmount, currentAppSettings.currency)}.`;
    activityEntries.push(await generateActivityEntryForUser(userId, {
      type: "RETURN_PROCESSED",
      description: mainReturnActivityDesc,
      details: {
        returnId: newReturnDoc.id,
        numericReturnId: newReturnDoc.numericReturnId,
        customerName: newReturnDoc.customerName,
        originalNumericSaleId: newReturnDoc.originalNumericSaleId,
        netRefundAmount: newReturnDoc.netRefundAmount,
        adjustmentAmount: newReturnDoc.adjustmentAmount,
        adjustmentType: newReturnDoc.adjustmentType,
        itemsReturned: newReturnDoc.items.map(i => ({ name: i.productName, qty: i.quantityReturned, stockUpdated: i.stockUpdated }))
      }
    }));

    return { newReturn: newReturnDoc, activityEntries, businessTransaction: createdBusinessTransaction };

  } catch (error) {
    return catchFirebaseError(error, 'addReturnForUser', `users/${userId}/${RETURNS_COLLECTION}`);
  }
};


export const getReturnsForUser = async (userId: string, period?: DashboardPeriod): Promise<Return[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");
  
  const returnsCollectionRef = collection(db, `users/${userId}/${RETURNS_COLLECTION}`);
  const queryConstraints = [orderBy("returnDate", "desc")];

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
      queryConstraints.push(where("returnDate", ">=", Timestamp.fromDate(startDate)));
      queryConstraints.push(where("returnDate", "<=", Timestamp.fromDate(endDate)));
    }
  }

  const q = query(returnsCollectionRef, ...queryConstraints);


  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            returnDate: data.returnDate instanceof Timestamp ? data.returnDate.toDate().toISOString() : new Date(data.returnDate).toISOString(),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
        } as Return;
    });
  } catch (error) {
    return catchFirebaseError(error, 'getReturnsForUser', `users/${userId}/${RETURNS_COLLECTION}`);
  }
};
