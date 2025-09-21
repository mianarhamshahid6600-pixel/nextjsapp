

import type { AppSettings, BusinessTransaction, FinancialTransactionType, ActivityLogEntry } from '@/lib/data-types';
import { db } from '@/lib/firebase/clientApp';
import { 
    collection, doc, getDoc, setDoc, addDoc, query, orderBy, getDocs, serverTimestamp, 
    writeBatch, Timestamp, runTransaction, where
} from 'firebase/firestore';
import { initialAppSettings } from '@/lib/data';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';
import { getAppSettingsFromFirestore, updateAppSettingsInFirestore } from './app-settings-service';
import { formatCurrency } from '../currency-utils';

const BUSINESS_TRANSACTIONS_COLLECTION = "businessTransactions";

export const addBusinessTransactionForUser = async (
  userId: string,
  transactionData: Omit<BusinessTransaction, 'id' | 'date'>
): Promise<BusinessTransaction> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to add a business transaction.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (!transactionData.userId || transactionData.userId !== userId) {
      throw new Error("Transaction data must include the correct and matching userId.");
  }

  const transactionsCollectionRef = collection(db, `users/${userId}/${BUSINESS_TRANSACTIONS_COLLECTION}`);
  const newTransactionRef = doc(transactionsCollectionRef); // Auto-generate ID

  const newTransaction: Omit<BusinessTransaction, 'id'> = {
    ...transactionData,
    date: serverTimestamp() as any, // Firestore will convert this
  };

  try {
    await setDoc(newTransactionRef, newTransaction);
    return { 
        ...newTransaction, 
        id: newTransactionRef.id, 
        date: new Date().toISOString() // Optimistic date
    } as BusinessTransaction;
  } catch (error) {
    return catchFirebaseError(error, 'addBusinessTransactionForUser', `users/${userId}/${BUSINESS_TRANSACTIONS_COLLECTION}`);
  }
};

export const adjustBusinessCashBalanceForUser = async (
  userId: string,
  adjustmentAmount: number,
  adjustmentType: 'credit' | 'debit',
  notes?: string
): Promise<{ updatedSettings: AppSettings, businessTransaction: BusinessTransaction, activityEntry: ActivityLogEntry }> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to adjust cash balance.");
  if (!db) throw new Error("Firestore is not initialized.");
  if (isNaN(adjustmentAmount) || adjustmentAmount <= 0) {
    throw new Error("Adjustment amount must be a positive number.");
  }

  const amountToApply = adjustmentType === 'credit' ? adjustmentAmount : -adjustmentAmount;
  const transactionTypeForBusinessLog: FinancialTransactionType = adjustmentType === 'credit' ? 'manual_adjustment_credit' : 'manual_adjustment_debit';
  
  try {
    let finalAppSettings: AppSettings;
    let newBusinessTx: BusinessTransaction;

    // Firestore transaction to update app settings (cash balance) and create business transaction log
    await runTransaction(db, async (transaction) => {
        const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
        const appSettingsSnap = await transaction.get(appSettingsRef);
        
        let currentCash = 0;
        if (appSettingsSnap.exists()) {
            currentCash = (appSettingsSnap.data() as AppSettings).currentBusinessCash || 0;
        } else {
            // If settings doc doesn't exist, initialize it (though getAppSettings should do this on first load)
            transaction.set(appSettingsRef, initialAppSettings);
        }
        const newCashBalance = currentCash + amountToApply;
        transaction.set(appSettingsRef, { currentBusinessCash: newCashBalance, lastUpdated: serverTimestamp() }, { merge: true });

        // Prepare the business transaction data
        const transactionsCollectionRef = collection(db, `users/${userId}/${BUSINESS_TRANSACTIONS_COLLECTION}`);
        const newTransactionRef = doc(transactionsCollectionRef); // Auto-generate ID for the business transaction log
        const businessTxData: Omit<BusinessTransaction, 'id'> = {
            userId: userId,
            description: `Manual cash balance adjustment: ${adjustmentType === 'credit' ? 'Credit' : 'Debit'}`,
            type: transactionTypeForBusinessLog,
            amount: amountToApply,
            notes: notes || undefined,
            relatedDocumentId: 'MANUAL_ADJUSTMENT',
            date: serverTimestamp() as any
        };
        transaction.set(newTransactionRef, businessTxData);

        // For returning optimistic data
        finalAppSettings = { 
            ...(appSettingsSnap.exists() ? appSettingsSnap.data() as AppSettings : initialAppSettings), 
            currentBusinessCash: newCashBalance 
        };
        newBusinessTx = { ...businessTxData, id: newTransactionRef.id, date: new Date().toISOString() } as BusinessTransaction;
    });
    
    // @ts-ignore - finalAppSettings and newBusinessTx are guaranteed to be set if transaction succeeds
    const currentCurrency = finalAppSettings.currency || initialAppSettings.currency;
    const activity = await generateActivityEntryForUser(userId, {
      type: "BUSINESS_CASH_ADJUSTMENT",
      description: `Business cash balance ${adjustmentType === 'credit' ? 'increased' : 'decreased'} by ${formatCurrency(adjustmentAmount, currentCurrency)}. New balance: ${formatCurrency(finalAppSettings.currentBusinessCash, currentCurrency)}. Notes: ${notes || 'N/A'}.`,
      details: { 
        adjustmentType, 
        amount: adjustmentAmount, 
        newBalance: finalAppSettings.currentBusinessCash, 
        notes: notes || 'N/A',
        relatedBusinessTransactionId: newBusinessTx.id 
      }
    });
    // @ts-ignore
    return { updatedSettings: finalAppSettings, businessTransaction: newBusinessTx, activityEntry: activity };

  } catch (error) {
    return catchFirebaseError(error, 'adjustBusinessCashBalanceForUser', `users/${userId}`);
  }
};

export const fetchBusinessTransactions = async (
  userId: string,
  startDate?: Date,
  endDate?: Date,
  allTime: boolean = false
): Promise<BusinessTransaction[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];
  if (!db) throw new Error("Firestore is not initialized.");
  
  const transactionsCollectionRef = collection(db, `users/${userId}/${BUSINESS_TRANSACTIONS_COLLECTION}`);
  const queryConstraints = [orderBy("date", "desc")];

  if (!allTime) {
    if (startDate) {
      queryConstraints.push(where("date", ">=", Timestamp.fromDate(startDate)));
    }
    if (endDate) {
      queryConstraints.push(where("date", "<=", Timestamp.fromDate(endDate)));
    }
  }
  
  const q = query(transactionsCollectionRef, ...queryConstraints);

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date instanceof Timestamp ? data.date.toDate().toISOString() : new Date(data.date).toISOString(),
      } as BusinessTransaction;
    });
  } catch (error) {
    return catchFirebaseError(error, 'fetchBusinessTransactions', `users/${userId}/${BUSINESS_TRANSACTIONS_COLLECTION}`);
  }
};


export const deleteAllBusinessTransactionsForUser = async (userId: string): Promise<{deletedCount: number}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID required to delete all business transactions.");
  try {
    const result = await batchDeleteCollection(userId, BUSINESS_TRANSACTIONS_COLLECTION);
    await generateActivityEntryForUser(userId, {
      type: "BUSINESS_CASH_ADJUSTMENT", // Or a more generic "DATA_DELETED"
      description: `All ${result.deletedCount} business transaction logs have been deleted.`,
      details: { action: "deleteAllBusinessTransactions", count: result.deletedCount }
    });
    return result;
  } catch (error) {
    return catchFirebaseError(error, 'deleteAllBusinessTransactionsForUser', `users/${userId}/${BUSINESS_TRANSACTIONS_COLLECTION}`);
  }
};
