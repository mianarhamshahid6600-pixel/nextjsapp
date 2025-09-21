

import type { Product, ActivityLogEntry, BusinessTransaction, AppSettings } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { db } from '@/lib/firebase/clientApp';
import {
    collection, doc, getDoc, setDoc, addDoc, deleteDoc, query, getDocs, serverTimestamp, writeBatch,
    Timestamp, runTransaction, orderBy, where, limit as firestoreLimit, increment
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { addBusinessTransactionForUser } from './financial-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';

const PRODUCTS_COLLECTION = "products";

export const getProductsForUser = async (userId: string): Promise<Product[]> => {
    ensureFirestoreInitialized();
    if (!userId) return [];
    if (!db) throw new Error("Firestore is not initialized.");

    const productsCollectionRef = collection(db, `users/${userId}/${PRODUCTS_COLLECTION}`);
    const q = query(productsCollectionRef, orderBy("name", "asc"));

    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                productCode: data.productCode || `CODE_MISSING_${doc.id.substring(0,4)}`,
                lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate().toISOString() : new Date(data.lastUpdated).toISOString(),
                costPrice: data.costPrice || 0,
                discountPercentage: data.discountPercentage === undefined ? 0 : data.discountPercentage, // Default to 0 if undefined
            } as Product;
        });
    } catch (error) {
        return catchFirebaseError(error, 'getProductsForUser', `users/${userId}/${PRODUCTS_COLLECTION}`);
    }
};

export const getProductByIdForUser = async (userId: string, productId: string): Promise<Product | undefined> => {
  ensureFirestoreInitialized();
  if (!userId || !productId) return undefined;
  if (!db) throw new Error("Firestore is not initialized.");

  const productDocRef = doc(db, `users/${userId}/${PRODUCTS_COLLECTION}`, productId);
  try {
    const docSnap = await getDoc(productDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
          id: docSnap.id,
          ...data,
          productCode: data.productCode || `CODE_MISSING_${docSnap.id.substring(0,4)}`,
          lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate().toISOString() : new Date(data.lastUpdated).toISOString(),
          costPrice: data.costPrice || 0,
          discountPercentage: data.discountPercentage === undefined ? 0 : data.discountPercentage,
        } as Product;
    }
    return undefined;
  } catch (error) {
    return catchFirebaseError(error, 'getProductByIdForUser', `users/${userId}/${PRODUCTS_COLLECTION}/${productId}`);
  }
};

export const getProductByCodeForUser = async (userId: string, productCode: string): Promise<Product | undefined> => {
  ensureFirestoreInitialized();
  if (!userId || !productCode.trim()) return undefined;
  if (!db) throw new Error("Firestore is not initialized.");

  const productsCollectionRef = collection(db, `users/${userId}/${PRODUCTS_COLLECTION}`);
  const q = query(productsCollectionRef, where("productCode", "==", productCode.trim()), firestoreLimit(1));

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        productCode: data.productCode,
        lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate().toISOString() : new Date(data.lastUpdated).toISOString(),
        costPrice: data.costPrice || 0,
        discountPercentage: data.discountPercentage === undefined ? 0 : data.discountPercentage,
      } as Product;
    }
    return undefined;
  } catch (error) {
    return catchFirebaseError(error, 'getProductByCodeForUser', `users/${userId}/${PRODUCTS_COLLECTION}`);
  }
};

export const addProductForUser = async (
  userId: string,
  productDetails: Omit<Product, 'id' | 'lastUpdated'>
): Promise<{ newProduct: Product, activityEntry: ActivityLogEntry, businessTransaction?: BusinessTransaction }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to add a product.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (!productDetails.productCode || !productDetails.productCode.trim()) {
    throw new Error("Product Code is required.");
  }
  const existingProductByCode = await getProductByCodeForUser(userId, productDetails.productCode.trim());
  if (existingProductByCode) {
      throw new Error(`Product with code "${productDetails.productCode.trim()}" already exists (Name: ${existingProductByCode.name}). Product codes must be unique.`);
  }

  if (typeof productDetails.costPrice !== 'number' || productDetails.costPrice < 0) {
    throw new Error("Valid cost price (0 or more) is required.");
  }
  if (typeof productDetails.stock !== 'number' || productDetails.stock < 0) {
    throw new Error("Valid initial stock quantity (0 or more) is required.");
  }
  if (productDetails.discountPercentage !== undefined && (typeof productDetails.discountPercentage !== 'number' || productDetails.discountPercentage < 0 || productDetails.discountPercentage > 100)) {
    throw new Error("Discount percentage must be a number between 0 and 100.");
  }


  const productsCollectionRef = collection(db, `users/${userId}/${PRODUCTS_COLLECTION}`);

  try {
    const newProductRef = doc(productsCollectionRef);
    const newProductData: Product = {
      ...productDetails,
      id: newProductRef.id,
      productCode: productDetails.productCode.trim(),
      name: productDetails.name.trim(),
      category: productDetails.category?.trim() || "Uncategorized",
      discountPercentage: productDetails.discountPercentage === undefined ? 0 : productDetails.discountPercentage,
      lastUpdated: new Date().toISOString()
    };

    const batch = writeBatch(db);
    batch.set(newProductRef, { ...newProductData, lastUpdated: serverTimestamp() });
    
    // Increment totalProducts counter in appSettings
    const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
    batch.update(appSettingsRef, { totalProducts: increment(1) });

    await batch.commit();
    
    const newProduct = { ...newProductData, lastUpdated: new Date().toISOString() };
    
    // --- Deferred Operations ---
    (async () => {
        try {
            if (newProduct.stock > 0 && newProduct.costPrice > 0) {
                const inventoryPurchaseCost = newProduct.costPrice * newProduct.stock;
                const appSettings = await getAppSettingsFromFirestore(userId); // Fetch latest settings
                await updateAppSettingsInFirestore(userId, appSettings, {
                    currentBusinessCash: (appSettings.currentBusinessCash || 0) - inventoryPurchaseCost
                });
                await addBusinessTransactionForUser(userId, {
                    userId: userId,
                    description: `Initial stock purchase: ${newProduct.name} (x${newProduct.stock})`,
                    type: 'purchase_payment',
                    amount: -inventoryPurchaseCost,
                    relatedDocumentId: newProduct.id,
                    notes: 'Cost of initial inventory added.'
                });
            }

            await generateActivityEntryForUser(userId, {
              type: "INVENTORY_UPDATE",
              description: `New product added: ${newProduct.name} (Code: ${newProduct.productCode}). Stock: ${newProduct.stock} @ ${newProduct.costPrice.toFixed(2)} each. Discount: ${newProduct.discountPercentage}%.`,
              details: { productName: newProduct.name, productCode: newProduct.productCode, productId: newProduct.id, newStock: newProduct.stock, costPrice: newProduct.costPrice, price: newProduct.price, discountPercentage: newProduct.discountPercentage }
            });
        } catch (deferredError) {
            console.error("Error during deferred operations for addProductForUser:", deferredError);
        }
    })();


    return { newProduct, activityEntry: null as any, businessTransaction: undefined }; // Return immediately
  } catch (error) {
    return catchFirebaseError(error, 'addProductForUser', `users/${userId}/${PRODUCTS_COLLECTION}`);
  }
};

export const updateProductStockForUser = async (
  userId: string,
  productId: string,
  quantityChange: number,
  action: "set" | "add" | "remove",
  formAction: "set" | "add/remove",
  costPriceForTx?: number
): Promise<{ updatedProduct: Product, activityEntry: ActivityLogEntry, businessTransaction?: BusinessTransaction }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required.");
  if (!db) throw new Error("Firestore is not initialized.");

  const productDocRef = doc(db, `users/${userId}/${PRODUCTS_COLLECTION}`, productId);

  try {
    const { updatedProduct, oldStock, stockDifference, currentCostPrice } = await runTransaction(db, async (transaction) => {
      const productSnap = await transaction.get(productDocRef);
      if (!productSnap.exists()) {
        throw new Error(`Product with ID ${productId} not found.`);
      }
      const productData = productSnap.data() as Product;
      const oldStock = productData.stock;
      let newStock = oldStock;

      if (formAction === "set") {
          newStock = quantityChange;
      } else { 
          if (action === 'add') newStock += quantityChange;
          else if (action === 'remove') newStock -= quantityChange;
      }
      
      if (newStock < 0) {
        console.warn(`Stock for ${productData.name} would go below zero. Capping at 0.`);
        newStock = 0;
      }
      
      const costPrice = costPriceForTx !== undefined ? costPriceForTx : productData.costPrice || 0;
      transaction.update(productDocRef, { stock: newStock, lastUpdated: serverTimestamp() });
      
      return { 
          updatedProduct: { ...productData, stock: newStock, lastUpdated: new Date().toISOString() },
          oldStock,
          stockDifference: newStock - oldStock,
          currentCostPrice: costPrice
      };
    });
    
    // --- Deferred Operations ---
    (async () => {
        try {
            if (stockDifference > 0 && currentCostPrice > 0) {
                const inventoryPurchaseCost = currentCostPrice * stockDifference;
                const appSettings = await getAppSettingsFromFirestore(userId);
                await updateAppSettingsInFirestore(userId, appSettings, {
                    currentBusinessCash: (appSettings.currentBusinessCash || 0) - inventoryPurchaseCost
                });
                await addBusinessTransactionForUser(userId, {
                    userId: userId,
                    description: `Stock added for ${updatedProduct.name} (x${stockDifference})`,
                    type: 'purchase_payment',
                    amount: -inventoryPurchaseCost,
                    relatedDocumentId: productId,
                    notes: 'Cost of added inventory stock.',
                });
            }
            
            let activityDescription = `Stock for ${updatedProduct.name} (Code: ${updatedProduct.productCode}) `;
             if (formAction === 'set') {
                activityDescription += `set to ${updatedProduct.stock}.`;
            } else {
                if (action === 'add') activityDescription += `increased by ${quantityChange}. New stock: ${updatedProduct.stock}.`;
                else activityDescription += `decreased by ${quantityChange}. New stock: ${updatedProduct.stock}.`;
            }

            await generateActivityEntryForUser(userId, {
              type: action === "add" ? "STOCK_ADD" : "INVENTORY_UPDATE",
              description: activityDescription,
              details: {
                productName: updatedProduct.name,
                productCode: updatedProduct.productCode,
                productId,
                oldStock,
                newStock: updatedProduct.stock,
                quantityChanged: Math.abs(stockDifference),
                action,
                source: formAction
              }
            });
        } catch (deferredError) {
             console.error("Error during deferred operations for updateProductStockForUser:", deferredError);
        }
    })();

    return { updatedProduct, activityEntry: null as any, businessTransaction: undefined }; // Return immediately
  } catch (error) {
    return catchFirebaseError(error, 'updateProductStockForUser', `users/${userId}/${PRODUCTS_COLLECTION}/${productId}`);
  }
};


export const updateProductDetailsForUser = async (
  userId: string,
  productId: string,
  details: Partial<Omit<Product, 'id' | 'lastUpdated' | 'stock' | 'productCode'>> & { costPrice?: number, discountPercentage?: number }
): Promise<{ updatedProduct: Product, activityEntry: ActivityLogEntry }> => {
    ensureFirestoreInitialized();
    if (!userId) throw new Error("User ID is required.");
    if (!db) throw new Error("Firestore is not initialized.");

    if (details.discountPercentage !== undefined && (typeof details.discountPercentage !== 'number' || details.discountPercentage < 0 || details.discountPercentage > 100)) {
        throw new Error("Discount percentage must be a number between 0 and 100.");
    }

    const productDocRef = doc(db, `users/${userId}/${PRODUCTS_COLLECTION}`, productId);
    try {
        const productSnap = await getDoc(productDocRef);
        if (!productSnap.exists()) throw new Error("Product not found for update.");

        const currentData = productSnap.data() as Product;
        const updatePayload: Partial<Product> = { ...details, lastUpdated: serverTimestamp() as any };
        
        if (details.discountPercentage === undefined) {
          updatePayload.discountPercentage = currentData.discountPercentage || 0;
        }


        await setDoc(productDocRef, updatePayload, { merge: true });

        const updatedProduct = { ...currentData, ...details, id: productId, lastUpdated: new Date().toISOString() } as Product;
        if (updatedProduct.discountPercentage === undefined) updatedProduct.discountPercentage = 0;


        const activityEntry = await generateActivityEntryForUser(userId, {
            type: "INVENTORY_UPDATE",
            description: `Details updated for product: ${updatedProduct.name} (Code: ${updatedProduct.productCode}).`,
            details: { productName: updatedProduct.name, productCode: updatedProduct.productCode, productId, updatedFields: Object.keys(details) }
        });
        return { updatedProduct, activityEntry };
    } catch (error) {
        return catchFirebaseError(error, 'updateProductDetailsForUser', `users/${userId}/${PRODUCTS_COLLECTION}/${productId}`);
    }
};

export const deleteProductFromStorageForUser = async (
  userId: string,
  productIdToDelete: string,
  creditCashForStock: boolean = false
): Promise<{ deletedProduct: Product, activityEntry: ActivityLogEntry, businessTransaction?: BusinessTransaction }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required.");
  if (!db) throw new Error("Firestore is not initialized.");

  const productDocRef = doc(db, `users/${userId}/${PRODUCTS_COLLECTION}`, productIdToDelete);
  try {
    const productSnap = await getDoc(productDocRef);
    if (!productSnap.exists()) throw new Error("Product to delete not found.");
    
    const deletedProductData = productSnap.data() as Product;
    
    const batch = writeBatch(db);
    batch.delete(productDocRef);
    
    const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
    batch.update(appSettingsRef, { totalProducts: increment(-1) });

    await batch.commit();

    let businessTransaction: BusinessTransaction | undefined = undefined;
    if (creditCashForStock && deletedProductData.stock > 0 && deletedProductData.costPrice > 0) {
      const creditAmount = deletedProductData.stock * deletedProductData.costPrice;
      const appSettings = await getAppSettingsFromFirestore(userId);
      await updateAppSettingsInFirestore(userId, appSettings, {
        currentBusinessCash: (appSettings.currentBusinessCash || 0) + creditAmount
      });
      
      businessTransaction = await addBusinessTransactionForUser(userId, {
        userId,
        description: `Stock value credited for deleted product: ${deletedProductData.name}`,
        type: 'stock_adjustment_credit',
        amount: creditAmount,
        relatedDocumentId: productIdToDelete,
        notes: `Credited for ${deletedProductData.stock} units at cost of ${deletedProductData.costPrice.toFixed(2)} each.`
      });
    }

    const activityEntry = await generateActivityEntryForUser(userId, {
      type: "PRODUCT_DELETE",
      description: `Product removed from inventory: ${deletedProductData.name} (Code: ${deletedProductData.productCode}).`,
      details: {
        productName: deletedProductData.name,
        productCode: deletedProductData.productCode,
        productId: productIdToDelete,
        creditedCash: creditCashForStock,
        creditedAmount: businessTransaction ? businessTransaction.amount : undefined
      }
    });

    return { deletedProduct: { ...deletedProductData, id: productIdToDelete }, activityEntry, businessTransaction };
  } catch (error) {
    return catchFirebaseError(error, 'deleteProductFromStorageForUser', `users/${userId}/${PRODUCTS_COLLECTION}/${productIdToDelete}`);
  }
};


export const deleteAllProductsForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required to delete all products.");
  try {
    const result = await batchDeleteCollection(userId, PRODUCTS_COLLECTION);
    
    // Reset the counter in appSettings
    if (result.deletedCount > 0) {
        const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
        await setDoc(appSettingsRef, { totalProducts: 0 }, { merge: true });
    }

    await generateActivityEntryForUser(userId, {
      type: "PRODUCT_DELETE",
      description: `All ${result.deletedCount} products have been deleted.`,
      details: { action: "deleteAllProducts", count: result.deletedCount }
    });
    return result;
  } catch (error) {
    return catchFirebaseError(error, 'deleteAllProductsForUser', `users/${userId}/${PRODUCTS_COLLECTION}`);
  }
};
