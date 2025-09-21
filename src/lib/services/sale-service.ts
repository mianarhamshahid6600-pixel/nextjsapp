

import type { Sale, SaleItem, ActivityLogEntry, DashboardPeriod, BusinessTransaction, Product, AppSettings, Customer } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { db } from '@/lib/firebase/clientApp';
import {
    collection, doc, getDocs, setDoc, query, where, orderBy, Timestamp,
    writeBatch, runTransaction, serverTimestamp, limit
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { addBusinessTransactionForUser } from './financial-service';
import { getProductByIdForUser, updateProductStockForUser } from './product-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { getCustomerByIdForUser, addCustomerForUser } from './customer-service';
import { formatCurrency } from '../currency-utils';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';


const SALES_COLLECTION = "sales";

export const getSalesForUser = async (userId: string, period?: DashboardPeriod): Promise<Sale[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");

  const salesCollectionRef = collection(db, `users/${userId}/${SALES_COLLECTION}`);
  const queryConstraints = [orderBy("saleDate", "desc")];

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
      queryConstraints.push(where("saleDate", ">=", Timestamp.fromDate(startDate)));
      queryConstraints.push(where("saleDate", "<=", Timestamp.fromDate(endDate)));
    }
  }
  const q = query(salesCollectionRef, ...queryConstraints);


  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            saleDate: data.saleDate instanceof Timestamp ? data.saleDate.toDate().toISOString() : new Date(data.saleDate).toISOString(),
        } as Sale;
    });
  } catch (error) {
    return catchFirebaseError(error, 'getSalesForUser', `users/${userId}/${SALES_COLLECTION}`);
  }
};


export const getSaleByNumericIdForUser = async (userId: string, numericSaleId: number): Promise<Sale | null> => {
  ensureFirestoreInitialized();
  if (!userId || isNaN(numericSaleId) || numericSaleId <= 0) return null;
  if (!db) throw new Error("Firestore is not initialized.");

  const salesCollectionRef = collection(db, `users/${userId}/${SALES_COLLECTION}`);
  const q = query(salesCollectionRef, where("numericSaleId", "==", numericSaleId), limit(1));

  try {
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      saleDate: data.saleDate instanceof Timestamp ? data.saleDate.toDate().toISOString() : new Date(data.saleDate).toISOString(),
    } as Sale;
  } catch (error) {
    return catchFirebaseError(error, 'getSaleByNumericIdForUser', `users/${userId}/${SALES_COLLECTION}`);
  }
};


export interface ProcessSaleBaseInput {
  itemsToSell: SaleItem[]; 
  subTotal: number;
  discountAmount?: number;
  estimatedTotalCogs?: number;
  customerName?: string;
}
export interface ProcessRegularSaleInput extends ProcessSaleBaseInput { saleType: "REGULAR"; customerId: string; }
export interface ProcessInstantSaleInput extends ProcessSaleBaseInput { saleType: "INSTANT"; shopName?: string; customerId?: string; }
export type ProcessSaleInput = ProcessRegularSaleInput | ProcessInstantSaleInput;

export const processSaleForUser = async (
  userId: string,
  saleInput: ProcessSaleInput,
): Promise<{
    newSale: Sale;
    activityEntries: ActivityLogEntry[];
    businessTransaction: BusinessTransaction | null;
    newlyCreatedCustomer: Customer | null;
    updatedProducts: Product[];
}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required for processing sale.");
  if (!db) throw new Error("Firestore is not initialized.");

  let createdCustomer: Customer | null = null;
  const updatedProducts: Product[] = [];
  
  // --- Start of primary, fast transaction ---
  const newSale = await runTransaction(db, async (transaction) => {
    // 1. READ PHASE: Get app settings and product stock levels
    const appSettingsDocRef = doc(db, `users/${userId}/settings`, "app_config");
    // Force a server read to guarantee the latest numeric ID.
    const appSettingsSnap = await transaction.get(appSettingsDocRef);
    const appSettings = appSettingsSnap.exists() ? appSettingsSnap.data() as AppSettings : initialAppSettings;
    
    const productReads = saleInput.itemsToSell
        .filter(item => item.productId !== "MANUAL_ENTRY")
        .map(item => transaction.get(doc(db, `users/${userId}/products`, item.productId)));
    const productSnaps = await Promise.all(productReads);

    // 2. VALIDATION & PREPARATION PHASE (in memory, no writes yet)
    let calculatedCogs = 0;
    const productStockUpdates: { ref: any, newStock: number }[] = [];
    for (let i = 0; i < productSnaps.length; i++) {
        const productSnap = productSnaps[i];
        const item = saleInput.itemsToSell.find(it => it.productId === productSnap.id)!;

        if (!productSnap.exists()) {
            throw new Error(`Product ${item.productName} (ID: ${item.productId}) not found.`);
        }
        const productData = productSnap.data() as Product;
        const newStock = productData.stock - item.quantity;
        if (newStock < 0) {
            throw new Error(`Not enough stock for ${item.productName}. Available: ${productData.stock}, Requested: ${item.quantity}`);
        }
        productStockUpdates.push({ ref: productSnap.ref, newStock });
        calculatedCogs += (productData.costPrice || 0) * item.quantity;
        updatedProducts.push({ ...productData, id: productSnap.id, stock: newStock, lastUpdated: new Date().toISOString() });
    }

    const nextNumericId = (appSettings.lastSaleNumericId || 0) + 1;
    
    // 3. WRITE PHASE (within transaction)
    // Update product stock levels
    productStockUpdates.forEach(update => {
        transaction.update(update.ref, { stock: update.newStock, lastUpdated: serverTimestamp() });
    });
    
    // ONLY update lastSaleNumericId here. Cash balance is deferred.
    transaction.update(appSettingsDocRef, { lastSaleNumericId: nextNumericId });
    
    const finalGrandTotal = Math.max(0, saleInput.subTotal - (saleInput.discountAmount || 0));

    // Create the Sale document
    const newSaleRef = doc(collection(db, `users/${userId}/${SALES_COLLECTION}`));
    const saleDataForFirestore: Partial<Sale> = {
        numericSaleId: nextNumericId,
        saleType: saleInput.saleType,
        items: saleInput.itemsToSell,
        subTotal: saleInput.subTotal,
        discountAmount: saleInput.discountAmount,
        grandTotal: finalGrandTotal,
        saleDate: serverTimestamp() as any,
        customerId: saleInput.customerId,
        customerName: saleInput.customerName,
        shopName: saleInput.saleType === "INSTANT" ? saleInput.shopName : undefined,
        estimatedTotalCogs: saleInput.estimatedTotalCogs !== undefined ? saleInput.estimatedTotalCogs : calculatedCogs,
        instantSaleItemsDescription: saleInput.saleType === "INSTANT" && saleInput.itemsToSell.some(i => i.productId === 'MANUAL_ENTRY') ? saleInput.itemsToSell.map(i => i.productName).join(', ') : undefined,
    };
    
    // Clean undefined fields before writing
    const cleanedSaleData: Record<string, any> = {};
    Object.keys(saleDataForFirestore).forEach(key => {
        if ((saleDataForFirestore as any)[key] !== undefined) {
            (cleanedSaleData as any)[key] = (saleDataForFirestore as any)[key];
        }
    });

    transaction.set(newSaleRef, cleanedSaleData);
    
    // Return the new sale data for the optimistic response
    return { ...cleanedSaleData, id: newSaleRef.id, saleDate: new Date().toISOString() } as Sale;
  });
  // --- End of primary transaction. From here, the user gets the success response. ---

  // --- Start of deferred, non-blocking operations ---
  // We don't await this promise chain from the main function return, allowing it to run in the background.
  (async () => {
    try {
        const appSettings = await getAppSettingsFromFirestore(userId);
        let finalCustomerId = newSale.customerId;

        // 1. Handle New Customer Creation (if needed)
        const isPhoneNumber = /^\d[\d\s-]*\d$/.test(newSale.customerName!.trim());
        const isNewCustomer = finalCustomerId === 'CUST_WALK_IN' &&
                              newSale.customerName &&
                              newSale.customerName.trim() !== '' &&
                              newSale.customerName !== (appSettings.walkInCustomerDefaultName || "Walk-in Customer");
        
        if (isNewCustomer) {
            const newNumericCustId = (appSettings.lastCustomerNumericId || 0) + 1;
            const newCustIdString = `CUST${newNumericCustId.toString().padStart(3, '0')}`;
            const customerData = {
                name: isPhoneNumber ? "Cash" : newSale.customerName!.trim(),
                phone: isPhoneNumber ? newSale.customerName!.trim() : "N/A",
            };
            const { newCustomer } = await addCustomerForUser(userId, customerData);
            createdCustomer = newCustomer;

            // Update the sale document with the new customer ID (eventual consistency)
            const saleDocRef = doc(db, `users/${userId}/${SALES_COLLECTION}`, newSale.id);
            await setDoc(saleDocRef, { customerId: newCustomer.id }, { merge: true });

            await generateActivityEntryForUser(userId, {
                type: 'NEW_CUSTOMER',
                description: `New customer "${createdCustomer.name}" was automatically created from sale #${newSale.numericSaleId}.`,
                details: { customerId: createdCustomer.id, customerName: createdCustomer.name, source: 'auto_from_sale' }
            });
        }
        
        // 2. Update Business Cash Balance
        await updateAppSettingsInFirestore(userId, appSettings, {
            currentBusinessCash: (appSettings.currentBusinessCash || 0) + newSale.grandTotal,
        });

        // 3. Log Business Transaction for income
        if (newSale.grandTotal > 0) {
            await addBusinessTransactionForUser(userId, {
                userId: userId,
                description: `Income from Sale #${newSale.numericSaleId}${newSale.customerName ? ` to ${newSale.customerName}` : ''}${newSale.shopName ? ` at ${newSale.shopName}` : ''}`,
                type: 'sale_income',
                amount: newSale.grandTotal,
                relatedDocumentId: newSale.id,
                notes: `${newSale.items.length} item(s) sold.`
            });
        }
        
        // 4. Log stock and sale activities
        for (const item of newSale.items) {
            if (item.productId !== "MANUAL_ENTRY") {
                const product = updatedProducts.find(p => p.id === item.productId);
                const oldStock = (product?.stock ?? 0) + item.quantity;
                const stockActivityDesc = `Stock for ${item.productName} decreased by ${item.quantity} due to sale #${newSale.numericSaleId}. New stock: ${product?.stock}.`;
                await generateActivityEntryForUser(userId, {
                    type: "INVENTORY_UPDATE", description: stockActivityDesc,
                    details: { productName: item.productName, productCode: item.productCode || product?.productCode, productId: item.productId, oldStock: oldStock, newStock: product?.stock, quantityChanged: item.quantity, saleId: newSale.numericSaleId }
                });
            }
        }
        
        const saleTypeDisplay = newSale.saleType.charAt(0).toUpperCase() + newSale.saleType.slice(1).toLowerCase();
        let saleActivityDescription = `${saleTypeDisplay} Sale #${newSale.numericSaleId} processed. Total: ${formatCurrency(newSale.grandTotal, appSettings.currency)}.`;
        if (newSale.customerName) saleActivityDescription += ` Customer: ${newSale.customerName}.`;
        if (newSale.shopName) saleActivityDescription += ` Shop: ${newSale.shopName}.`;
        
        await generateActivityEntryForUser(userId, {
          type: "SALE", description: saleActivityDescription,
          details: { saleId: newSale.id, numericSaleId: newSale.numericSaleId, grandTotal: newSale.grandTotal, customerName: newSale.customerName, shopName: newSale.shopName }
        });

    } catch (deferredError) {
        // Log any errors from the deferred operations. This won't affect the user who has already seen success.
        console.error("Error during deferred sale processing operations:", deferredError);
        // Here you might want to log this to a special error collection in Firestore for monitoring.
    }})();
  // --- End of deferred operations ---
    
  // Return immediately with the core sale data
  return { 
      newSale, 
      activityEntries: [], // Activity entries are now handled in the background
      businessTransaction: null, // Business transaction is now handled in the background
      newlyCreatedCustomer: null, // Customer creation is now handled in the background
      updatedProducts 
  };

};

export const deleteAllSalesForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required to delete all sales.");
  try {
    const result = await batchDeleteCollection(userId, SALES_COLLECTION);
    await generateActivityEntryForUser(userId, {
      type: "SALE",
      description: `All ${result.deletedCount} sales records have been deleted.`,
      details: { action: "deleteAllSales", count: result.deletedCount }
    });
    return result;
  } catch (error) {
    return catchFirebaseError(error, 'deleteAllSalesForUser', `users/${userId}/${SALES_COLLECTION}`);
  }
};
