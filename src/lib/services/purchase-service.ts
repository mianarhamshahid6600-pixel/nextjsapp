

import type { PurchaseInvoice, ActivityLogEntry, Product, Supplier, BusinessTransaction, AppSettings, PurchaseItem, DashboardPeriod } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { db } from '@/lib/firebase/clientApp';
import { 
    collection, doc, getDocs, setDoc, query, orderBy, Timestamp, 
    writeBatch, runTransaction, serverTimestamp, addDoc, getDoc, where
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { addBusinessTransactionForUser } from './financial-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { getProductByCodeForUser } from './product-service'; // Import getProductByCodeForUser
import { formatCurrency } from '../currency-utils';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

const PURCHASE_INVOICES_COLLECTION = "purchaseInvoices";

export const addPurchaseInvoiceForUser = async (
  userId: string,
  invoiceData: Omit<PurchaseInvoice, 'id' | 'numericPurchaseId' | 'paymentStatus' | 'createdAt'>
): Promise<{ newPurchaseInvoice: PurchaseInvoice; activityEntries: ActivityLogEntry[]; businessTransaction: BusinessTransaction | null }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to add a purchase invoice.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (!invoiceData.supplierId) throw new Error("Supplier ID is required.");
  if (!invoiceData.items || invoiceData.items.length === 0) throw new Error("At least one item is required for a purchase invoice.");

  // Pre-flight validation for new (manual) products
  for (const item of invoiceData.items) {
    if (item.productId === "MANUAL_PURCHASE_ITEM") {
      if (!item.productCode || !item.productCode.trim()) {
        throw new Error(`A product code is required for the new item "${item.productName}".`);
      }
      if (!item.salePrice || item.salePrice <= 0) {
        throw new Error(`A valid sale price is required for new item "${item.productName}".`);
      }
      const existingProduct = await getProductByCodeForUser(userId, item.productCode.trim());
      if (existingProduct) {
        throw new Error(`A product with code "${item.productCode.trim()}" already exists. Please use the 'Received Items (from Inventory)' section to add stock for existing products.`);
      }
    }
  }


  const purchaseActivityLogPayloads: Array<Omit<ActivityLogEntry, 'id' | 'timestamp'>> = [];
  let loggedBusinessTransaction: BusinessTransaction | null = null;
  let finalNewPurchaseInvoice: PurchaseInvoice;

  let activityLogDataForProducts_temp: Array<{ productName: string, productCode?: string, productId: string, oldStock: number, newStock: number, quantityChanged: number, costPrice: number, purchaseId: number }> = [];
  let activityLogDataForNewProducts_temp: Array<{ productName: string, productCode?: string, quantity: number, costPrice: number, purchaseId: number }> = [];
  let activityLogDataForSupplierBalance_temp: { supplierName: string, supplierId: string, change: number, newBalance: number, purchaseId: number } | null = null;
  let appSettingsForActivity_temp: AppSettings;


  try {
    const newPurchaseInvoiceRef = doc(collection(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`));

    await runTransaction(db, async (transaction) => {
      const appSettingsDocRef = doc(db, `users/${userId}/settings`, "app_config");
      const appSettingsSnap = await transaction.get(appSettingsDocRef);
      appSettingsForActivity_temp = appSettingsSnap.exists() ? appSettingsSnap.data() as AppSettings : { ...initialAppSettings };
      const currentAppSettings = appSettingsForActivity_temp;

      const supplierDocRef = doc(db, `users/${userId}/suppliers`, invoiceData.supplierId);
      const supplierSnap = await transaction.get(supplierDocRef);
      if (!supplierSnap.exists()) throw new Error(`Supplier with ID ${invoiceData.supplierId} not found.`);
      const supplier = { id: supplierSnap.id, ...supplierSnap.data() } as Supplier;

      const inventoriedItems = invoiceData.items.filter(item => item.productId !== "MANUAL_PURCHASE_ITEM");
      const manualItems = invoiceData.items.filter(item => item.productId === "MANUAL_PURCHASE_ITEM");
      
      const productSnapshots = await Promise.all(
        inventoriedItems.map(item => transaction.get(doc(db, `users/${userId}/products`, item.productId)))
      );

      activityLogDataForProducts_temp = []; 
      activityLogDataForNewProducts_temp = [];
      activityLogDataForSupplierBalance_temp = null;

      const nextNumericPurchaseId = (currentAppSettings.lastPurchaseNumericId || 0) + 1;
      const finalInvoiceItems: PurchaseItem[] = [];
      const productUpdates: Array<{ ref: any, payload: Partial<Product> }> = [];

      for (let i = 0; i < inventoriedItems.length; i++) {
        const item = inventoriedItems[i];
        const productSnap = productSnapshots[i];
        if (!productSnap.exists()) {
          throw new Error(`Product ${item.productName} (ID: ${item.productId}) not found during purchase transaction.`);
        }
        const productData = productSnap.data() as Product;
        finalInvoiceItems.push({ ...item, productCode: productData.productCode });

        const newStock = productData.stock + item.quantity;
        const productUpdatePayload: Partial<Product> = { stock: newStock, lastUpdated: serverTimestamp() as any };
        if (item.purchasePrice !== productData.costPrice) {
            productUpdatePayload.costPrice = item.purchasePrice;
        }
        productUpdates.push({ ref: productSnap.ref, payload: productUpdatePayload });
        activityLogDataForProducts_temp.push({
            productName: productData.name, productCode: productData.productCode, productId: item.productId,
            oldStock: productData.stock, newStock: newStock, quantityChanged: item.quantity,
            costPrice: item.purchasePrice, purchaseId: nextNumericPurchaseId
        });
      }
      
      // Process manual items by creating new products
      for (const item of manualItems) {
        const newProductRef = doc(collection(db, `users/${userId}/products`));
        const newProductData: Omit<Product, 'id'> = {
            productCode: item.productCode!, // Already validated non-empty and unique
            name: item.productName,
            price: item.salePrice!, // This is the intended sale price, validated to exist
            costPrice: item.purchasePrice,
            stock: item.quantity,
            category: "Uncategorized",
            supplier: supplier.id,
            lastUpdated: serverTimestamp() as any,
            discountPercentage: 0,
        };
        transaction.set(newProductRef, newProductData);
        
        // Add to finalInvoiceItems with the new product ID
        finalInvoiceItems.push({
            productId: newProductRef.id,
            productCode: newProductData.productCode,
            productName: newProductData.name,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            itemTotal: item.quantity * item.purchasePrice,
            salePrice: item.salePrice
        });

        // Log creation activity
        activityLogDataForNewProducts_temp.push({
            productName: newProductData.name,
            productCode: newProductData.productCode,
            quantity: newProductData.stock,
            costPrice: newProductData.costPrice,
            purchaseId: nextNumericPurchaseId
        });
      }


      const amountOwedToSupplierChange = invoiceData.grandTotal - invoiceData.amountPaid;
      const currentSupplierBalance = supplier.currentBalance || 0;
      const newSupplierBalance = currentSupplierBalance + amountOwedToSupplierChange;

      activityLogDataForSupplierBalance_temp = {
          supplierName: supplier.name || supplier.companyName || 'Unknown Supplier',
          supplierId: invoiceData.supplierId,
          change: amountOwedToSupplierChange,
          newBalance: newSupplierBalance,
          purchaseId: nextNumericPurchaseId
      };

      const updatedAppSettingsPayload: Partial<AppSettings> = {
        lastPurchaseNumericId: nextNumericPurchaseId,
        currentBusinessCash: (currentAppSettings.currentBusinessCash || 0) - invoiceData.amountPaid,
      };

      let paymentStatus: 'paid' | 'partially_paid' | 'unpaid' = 'unpaid';
      if (invoiceData.amountPaid >= invoiceData.grandTotal && invoiceData.grandTotal > 0) paymentStatus = 'paid';
      else if (invoiceData.amountPaid > 0 && invoiceData.amountPaid < invoiceData.grandTotal) paymentStatus = 'partially_paid';

      const purchaseDataForFirestore: Record<string, any> = {
        numericPurchaseId: nextNumericPurchaseId,
        supplierId: invoiceData.supplierId,
        supplierName: supplier.name || supplier.companyName || 'Unknown Supplier',
        invoiceNumber: invoiceData.invoiceNumber.trim() || `AUTOGEN-${nextNumericPurchaseId}`, // Auto-generate if empty
        invoiceDate: invoiceData.invoiceDate,
        items: finalInvoiceItems,
        subTotal: invoiceData.subTotal,
        grandTotal: invoiceData.grandTotal,
        amountPaid: invoiceData.amountPaid,
        paymentStatus: paymentStatus,
        createdAt: serverTimestamp(),
      };

      if (invoiceData.taxAmount !== undefined && !isNaN(invoiceData.taxAmount)) {
        purchaseDataForFirestore.taxAmount = invoiceData.taxAmount;
      } else {
        purchaseDataForFirestore.taxAmount = 0; 
      }

      if (invoiceData.notes && invoiceData.notes.trim() !== "") {
        purchaseDataForFirestore.notes = invoiceData.notes.trim();
      }
      
      finalNewPurchaseInvoice = {
        id: newPurchaseInvoiceRef.id,
        ...purchaseDataForFirestore,
        invoiceDate: invoiceData.invoiceDate, 
        createdAt: new Date().toISOString(), 
      } as PurchaseInvoice;

      productUpdates.forEach(pu => transaction.update(pu.ref, pu.payload));
      transaction.update(supplierDocRef, { currentBalance: newSupplierBalance });
      transaction.set(appSettingsDocRef, updatedAppSettingsPayload, { merge: true });
      transaction.set(newPurchaseInvoiceRef, purchaseDataForFirestore);
    });

    for (const logData of activityLogDataForProducts_temp) {
        const stockActivityDesc = `Stock for ${logData.productName} (Code: ${logData.productCode || 'N/A'}) increased by ${logData.quantityChanged} from purchase #${logData.purchaseId}. New stock: ${logData.newStock}. Cost: ${formatCurrency(logData.costPrice, appSettingsForActivity_temp.currency)}.`;
        purchaseActivityLogPayloads.push({
          type: "STOCK_ADD", description: stockActivityDesc,
          details: { productName: logData.productName, productCode: logData.productCode, productId: logData.productId, oldStock: logData.oldStock, newStock: logData.newStock, quantityChanged: logData.quantityChanged, purchaseId: logData.purchaseId, costPrice: logData.costPrice }
        });
    }

    for (const logData of activityLogDataForNewProducts_temp) {
        const newProdActivityDesc = `New product "${logData.productName}" (Code: ${logData.productCode || 'N/A'}) created and added to inventory via purchase #${logData.purchaseId}. Initial stock: ${logData.quantity}.`;
        purchaseActivityLogPayloads.push({
            type: "INVENTORY_UPDATE",
            description: newProdActivityDesc,
            details: { ...logData, newProductCreated: true }
        });
    }


    if (activityLogDataForSupplierBalance_temp) {
        const { supplierName, change, newBalance, purchaseId } = activityLogDataForSupplierBalance_temp;
        const balanceActivityDesc = `Balance for supplier ${supplierName} updated by ${formatCurrency(change, appSettingsForActivity_temp.currency)} due to purchase #${purchaseId}. New balance: ${formatCurrency(newBalance, appSettingsForActivity_temp.currency)}.`;
        purchaseActivityLogPayloads.push({
            type: "SUPPLIER_BALANCE_UPDATE", description: balanceActivityDesc,
            details: { supplierName, supplierId: activityLogDataForSupplierBalance_temp.supplierId, change, newBalance, purchaseId }
        });
    }
    
    const mainPurchaseActivityDesc = `Purchase Invoice #${finalNewPurchaseInvoice.numericPurchaseId} recorded from ${finalNewPurchaseInvoice.supplierName} for ${formatCurrency(finalNewPurchaseInvoice.grandTotal, appSettingsForActivity_temp.currency)}.`;
    purchaseActivityLogPayloads.push({
      type: "PURCHASE_RECORDED", description: mainPurchaseActivityDesc,
      details: { purchaseId: finalNewPurchaseInvoice.id, numericPurchaseId: finalNewPurchaseInvoice.numericPurchaseId, supplierName: finalNewPurchaseInvoice.supplierName, grandTotal: finalNewPurchaseInvoice.grandTotal, amountPaid: finalNewPurchaseInvoice.amountPaid }
    });
    
    const generatedActivities = await Promise.all(
        purchaseActivityLogPayloads.map(payload => generateActivityEntryForUser(userId, payload))
    );
    
    if (finalNewPurchaseInvoice.amountPaid > 0) {
        loggedBusinessTransaction = await addBusinessTransactionForUser(userId, {
            userId: userId,
            description: `Payment for Purchase #${finalNewPurchaseInvoice.numericPurchaseId} to ${finalNewPurchaseInvoice.supplierName}`,
            type: 'purchase_payment',
            amount: -finalNewPurchaseInvoice.amountPaid,
            relatedDocumentId: finalNewPurchaseInvoice.id,
            notes: `Paid ${formatCurrency(finalNewPurchaseInvoice.amountPaid, appSettingsForActivity_temp.currency)} for goods.`
        });
    }
    // @ts-ignore
    return { newPurchaseInvoice: finalNewPurchaseInvoice, activityEntries: generatedActivities, businessTransaction: loggedBusinessTransaction };

  } catch (error) {
    return catchFirebaseError(error, 'addPurchaseInvoiceForUser', `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`);
  }
};

export const getPurchaseInvoicesForUser = async (userId: string, period?: DashboardPeriod): Promise<PurchaseInvoice[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");
  
  const invoicesCollectionRef = collection(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`);
  const queryConstraints = [orderBy("numericPurchaseId", "asc")]; // Changed to numericPurchaseId for primary sort

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
      // Assuming invoiceDate is stored as a Firestore Timestamp or compatible string
      queryConstraints.push(where("invoiceDate", ">=", Timestamp.fromDate(startDate)));
      queryConstraints.push(where("invoiceDate", "<=", Timestamp.fromDate(endDate)));
    }
  }
  
  const q = query(invoicesCollectionRef, ...queryConstraints);


  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            invoiceDate: data.invoiceDate instanceof Timestamp ? data.invoiceDate.toDate().toISOString() : new Date(data.invoiceDate).toISOString(),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
        } as PurchaseInvoice;
    });
  } catch (error) {
    return catchFirebaseError(error, 'getPurchaseInvoicesForUser', `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`);
  }
};

export const getOpenPurchaseInvoicesForSupplier = async (userId: string, supplierId: string): Promise<PurchaseInvoice[]> => {
  ensureFirestoreInitialized();
  if (!userId || !supplierId) return [];
  if (!db) throw new Error("Firestore is not initialized.");

  const invoicesCollectionRef = collection(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`);
  
  const q = query(
    invoicesCollectionRef,
    where("supplierId", "==", supplierId),
    orderBy("invoiceDate", "asc")
  );

  try {
    const querySnapshot = await getDocs(q);
    
    const allInvoices = querySnapshot.docs.map((docSnap): PurchaseInvoice => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            invoiceDate: data.invoiceDate instanceof Timestamp ? data.invoiceDate.toDate().toISOString() : new Date(data.invoiceDate).toISOString(),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
        } as PurchaseInvoice;
    });
    
    // Filter in code
    return allInvoices.filter(invoice => invoice.paymentStatus === 'unpaid' || invoice.paymentStatus === 'partially_paid');
    
  } catch (error) {
    return catchFirebaseError(error, 'getOpenPurchaseInvoicesForSupplier', `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`);
  }
};

export const getPurchaseInvoiceByIdForUser = async (userId: string, invoiceId: string): Promise<PurchaseInvoice | undefined> => {
  ensureFirestoreInitialized();
  if (!userId || !invoiceId) return undefined;
  if (!db) throw new Error("Firestore is not initialized.");

  const invoiceDocRef = doc(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`, invoiceId);
  try {
    const docSnap = await getDoc(invoiceDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { 
          id: docSnap.id, 
          ...data,
          invoiceDate: data.invoiceDate instanceof Timestamp ? data.invoiceDate.toDate().toISOString() : new Date(data.invoiceDate).toISOString(),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
        } as PurchaseInvoice;
    }
    return undefined;
  } catch (error) {
    return catchFirebaseError(error, 'getPurchaseInvoiceByIdForUser', `users/${userId}/${PURCHASE_INVOICES_COLLECTION}/${invoiceId}`);
  }
};

export const updatePurchaseInvoiceForUser = async (
  userId: string,
  invoiceId: string,
  originalInvoice: PurchaseInvoice,
  updatedData: Omit<PurchaseInvoice, 'id' | 'numericPurchaseId' | 'paymentStatus' | 'createdAt'>
): Promise<{ updatedPurchaseInvoice: PurchaseInvoice; activityEntries: ActivityLogEntry[] }> => {
    ensureFirestoreInitialized();
    if (!userId || !invoiceId) throw new Error("User ID and Invoice ID are required.");
    if (!db) throw new Error("Firestore is not initialized.");

    const purchaseInvoiceRef = doc(db, `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`, invoiceId);
    let activityEntries: ActivityLogEntry[] = [];
    
    try {
        await runTransaction(db, async (transaction) => {
            // Read necessary documents within the transaction
            const supplierDocRef = doc(db, `users/${userId}/suppliers`, updatedData.supplierId);
            const appSettingsDocRef = doc(db, `users/${userId}/settings`, "app_config");

            const [originalInvoiceSnap, supplierSnap, appSettingsSnap] = await Promise.all([
                transaction.get(purchaseInvoiceRef),
                transaction.get(supplierDocRef),
                transaction.get(appSettingsDocRef)
            ]);

            if (!originalInvoiceSnap.exists()) throw new Error("Original purchase invoice not found.");
            if (!supplierSnap.exists()) throw new Error("Supplier not found.");
            
            const originalData = originalInvoiceSnap.data() as PurchaseInvoice;
            const supplierData = supplierSnap.data() as Supplier;
            const appSettings = appSettingsSnap.exists() ? appSettingsSnap.data() as AppSettings : initialAppSettings;

            // --- Inventory Stock Adjustment Logic ---
            const stockChanges = new Map<string, number>();
            // Decrease stock based on old items
            originalData.items.forEach(item => {
                stockChanges.set(item.productId, (stockChanges.get(item.productId) || 0) - item.quantity);
            });
            // Increase stock based on new items
            updatedData.items.forEach(item => {
                stockChanges.set(item.productId, (stockChanges.get(item.productId) || 0) + item.quantity);
            });
            
            for (const [productId, quantityChange] of stockChanges.entries()) {
                if (quantityChange !== 0) {
                    const productRef = doc(db, `users/${userId}/products`, productId);
                    const productSnap = await transaction.get(productRef);
                    if (productSnap.exists()) {
                        const newStock = (productSnap.data().stock || 0) + quantityChange;
                        transaction.update(productRef, { stock: newStock });
                    }
                }
            }

            // --- Supplier Balance Adjustment Logic ---
            const oldAmountOwed = originalData.grandTotal - originalData.amountPaid;
            const newAmountOwed = updatedData.grandTotal - updatedData.amountPaid;
            const balanceAdjustment = newAmountOwed - oldAmountOwed;
            const newSupplierBalance = supplierData.currentBalance + balanceAdjustment;
            transaction.update(supplierDocRef, { currentBalance: newSupplierBalance });
            
            // --- Business Cash Adjustment Logic ---
            const cashAdjustment = originalData.amountPaid - updatedData.amountPaid;
            const newBusinessCash = appSettings.currentBusinessCash + cashAdjustment;
            transaction.update(appSettingsDocRef, { currentBusinessCash: newBusinessCash });

            // --- Update Purchase Invoice Document ---
            const paymentStatus: 'paid' | 'partially_paid' | 'unpaid' = 
                updatedData.amountPaid >= updatedData.grandTotal && updatedData.grandTotal > 0 ? 'paid' :
                updatedData.amountPaid > 0 ? 'partially_paid' : 'unpaid';

            transaction.update(purchaseInvoiceRef, {
                ...updatedData,
                paymentStatus,
                lastUpdatedAt: serverTimestamp()
            });
        });

        // Generate activity logs outside the transaction
        activityEntries.push(await generateActivityEntryForUser(userId, {
            type: "PURCHASE_RECORDED",
            description: `Purchase Invoice #${originalInvoice.numericPurchaseId} was updated.`,
            details: { purchaseId: invoiceId, numericPurchaseId: originalInvoice.numericPurchaseId }
        }));
        
        return {
            updatedPurchaseInvoice: { ...originalInvoice, ...updatedData }, // Simplified return
            activityEntries
        };

    } catch (error) {
        return catchFirebaseError(error, 'updatePurchaseInvoiceForUser', `users/${userId}/${PURCHASE_INVOICES_COLLECTION}/${invoiceId}`);
    }
};

export const deleteAllPurchaseInvoicesForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required to delete all purchase invoices.");
  try {
    const result = await batchDeleteCollection(userId, PURCHASE_INVOICES_COLLECTION);
     await generateActivityEntryForUser(userId, {
      type: "PURCHASE_RECORDED", 
      description: `All ${result.deletedCount} purchase invoices have been deleted.`,
      details: { action: "deleteAllPurchaseInvoices", count: result.deletedCount }
    });
    return result;
  } catch (error) {
    return catchFirebaseError(error, 'deleteAllPurchaseInvoicesForUser', `users/${userId}/${PURCHASE_INVOICES_COLLECTION}`);
  }
};
