

import { db } from '@/lib/firebase/clientApp';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    writeBatch,
    serverTimestamp,
    Timestamp,
    query,
    orderBy,
    deleteDoc,
    limit
} from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import {
    getProductsForUser,
} from './product-service';
import {
    getCustomersForUser,
} from './customer-service';
import {
    getSuppliersForUser,
} from './supplier-service';
import {
    getSalesForUser,
} from './sale-service';
import {
    getPurchaseInvoicesForUser,
} from './purchase-service';
import {
    getQuotationsForUser,
} from './quotation-service';
import {
    getReturnsForUser,
} from './return-service';
import {
    fetchBusinessTransactions,
} from './financial-service';
import {
    getActivityLogForUser,
    generateActivityEntryForUser
} from './activity-log-service';
import {
    getAppSettingsFromFirestore,
    updateAppSettingsInFirestore
} from './app-settings-service';
import type { AppSettings, BackupDocument, BackupRecord, ActivityLogEntry, Product, Customer, Supplier, Sale, PurchaseInvoice, Quotation, Return as ReturnType, BusinessTransaction } from '@/lib/data-types';
import { initialAppSettings } from '../data';


const BACKUPS_COLLECTION = "backups";
const COLLECTIONS_TO_BACKUP = [
    "products", "customers", "suppliers", "sales",
    "purchaseInvoices", "quotations", "returns",
    "businessTransactions", "activityLog"
] as const; 

const performBackupLogic = async (
    userId: string,
    currentAppSettings: AppSettings,
    backupType: 'manual' | 'automatic_client'
): Promise<{ backupId: string, timestamp: string, activityEntry: ActivityLogEntry }> => {
    ensureFirestoreInitialized();
    if (!userId || !db) throw new Error("User ID and Firestore instance are required.");

    const backupTimestamp = new Date();
    const typeLabel = backupType === 'manual' ? 'Manual' : 'Automatic (Client-Triggered)';
    const backupDescription = `${typeLabel} Backup - ${backupTimestamp.toLocaleString()}`;
    const backupId = `${backupType === 'manual' ? 'manual' : 'auto-client'}-${backupTimestamp.getTime()}`;

    try {
        const products = await getProductsForUser(userId);
        const customers = await getCustomersForUser(userId, "all_time");
        const suppliers = await getSuppliersForUser(userId);
        const sales = await getSalesForUser(userId, "all_time");
        const purchaseInvoices = await getPurchaseInvoicesForUser(userId, "all_time");
        const quotations = await getQuotationsForUser(userId, "all_time");
        const returns = await getReturnsForUser(userId, "all_time");
        const businessTransactions = await fetchBusinessTransactions(userId, undefined, undefined, true);
        const activityLog = await getActivityLogForUser(userId, 10000);

        const { backupConfig, ...appSettingsSnapshot } = currentAppSettings;

        const backupData: BackupDocument['data'] = {
            products, customers, suppliers, sales, purchaseInvoices, quotations, returns,
            businessTransactions, activityLog,
            appSettingsSnapshot: appSettingsSnapshot as Omit<AppSettings, 'backupConfig'>
        };

        const backupDoc: Omit<BackupDocument, 'createdAt'> & { createdAt: any } = {
            description: backupDescription,
            version: 1,
            data: backupData,
            createdAt: serverTimestamp()
        };

        const backupDocRef = doc(db, `users/${userId}/${BACKUPS_COLLECTION}`, backupId);
        await setDoc(backupDocRef, backupDoc);

        const settingsUpdatePayload: Partial<AppSettings> = { backupConfig: { ...currentAppSettings.backupConfig } };
        if (backupType === 'manual') {
            settingsUpdatePayload.backupConfig!.lastManualBackupTimestamp = backupTimestamp.toISOString();
        } else {
            settingsUpdatePayload.backupConfig!.lastAutoBackupTimestamp = backupTimestamp.toISOString();
        }
        await updateAppSettingsInFirestore(userId, currentAppSettings, settingsUpdatePayload);
        
        const activityEntry = await generateActivityEntryForUser(userId, {
            type: "DATA_BACKUP",
            description: `${typeLabel} data backup created successfully. Backup ID: ${backupId}.`,
            details: { backupId, description: backupDescription, source: backupType }
        });

        return { backupId, timestamp: backupTimestamp.toISOString(), activityEntry };
    } catch (error) {
        return catchFirebaseError(error, `performBackupLogic (${backupType})`, `users/${userId}/${BACKUPS_COLLECTION}`);
    }
};


export const performManualBackup = async (
    userId: string,
    currentAppSettings: AppSettings
): Promise<{ backupId: string, timestamp: string, activityEntry: ActivityLogEntry }> => {
    return performBackupLogic(userId, currentAppSettings, 'manual');
};

export const performAutomaticClientBackup = async (
    userId: string,
    currentAppSettings: AppSettings
): Promise<{ backupId: string, timestamp: string, activityEntry: ActivityLogEntry } | null> => {
    try {
        console.log(`Attempting automatic client-side backup for user ${userId}...`);
        const result = await performBackupLogic(userId, currentAppSettings, 'automatic_client');
        console.log(`Automatic client-side backup successful for user ${userId}. Backup ID: ${result.backupId}`);
        return result;
    } catch (error) {
        console.error(`Automatic client-side backup failed for user ${userId}:`, error);
        // Optionally generate a specific activity log entry for the failure if needed
        // For now, just log to console and don't throw to avoid breaking app load if it's a transient issue
        return null;
    }
};


export const listBackups = async (userId: string): Promise<BackupRecord[]> => {
    ensureFirestoreInitialized();
    if (!userId || !db) return [];

    const backupsColRef = collection(db, `users/${userId}/${BACKUPS_COLLECTION}`);
    const q = query(backupsColRef, orderBy("createdAt", "desc"), limit(50)); 

    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(docSnap => {
            const data = docSnap.data() as Omit<BackupDocument, 'data'> & { createdAt: Timestamp };
            return {
                id: docSnap.id,
                createdAt: data.createdAt.toDate().toISOString(),
                description: data.description,
                version: data.version,
            };
        });
    } catch (error) {
        return catchFirebaseError(error, 'listBackups', `users/${userId}/${BACKUPS_COLLECTION}`);
    }
};


export const restoreFromBackup = async (
    userId: string,
    backupId: string
): Promise<{ success: boolean; message: string; activityEntry?: ActivityLogEntry }> => {
    ensureFirestoreInitialized();
    if (!userId || !backupId || !db) throw new Error("User ID, Backup ID, and Firestore instance are required.");

    const backupDocRef = doc(db, `users/${userId}/${BACKUPS_COLLECTION}`, backupId);

    try {
        const backupSnap = await getDoc(backupDocRef);
        if (!backupSnap.exists()) {
            throw new Error(`Backup with ID ${backupId} not found.`);
        }
        const backupDocument = backupSnap.data() as BackupDocument;
        const { data: backupData } = backupDocument;
        
        for (const colName of COLLECTIONS_TO_BACKUP) {
            await batchDeleteCollection(userId, colName as string);
        }
        
        const batch = writeBatch(db);
        
        if (backupData.products) backupData.products.forEach(p => batch.set(doc(db, `users/${userId}/products`, p.id), p));
        if (backupData.customers) backupData.customers.forEach(c => batch.set(doc(db, `users/${userId}/customers`, c.id), c));
        if (backupData.suppliers) backupData.suppliers.forEach(s => batch.set(doc(db, `users/${userId}/suppliers`, s.id), s));
        if (backupData.sales) backupData.sales.forEach(s => batch.set(doc(db, `users/${userId}/sales`, s.id), { ...s, saleDate: Timestamp.fromDate(new Date(s.saleDate)) }));
        if (backupData.purchaseInvoices) backupData.purchaseInvoices.forEach(pi => batch.set(doc(db, `users/${userId}/purchaseInvoices`, pi.id), { ...pi, invoiceDate: Timestamp.fromDate(new Date(pi.invoiceDate)), createdAt: Timestamp.fromDate(new Date(pi.createdAt)) }));
        if (backupData.quotations) backupData.quotations.forEach(q => batch.set(doc(db, `users/${userId}/quotations`, q.id), { ...q, quoteDate: Timestamp.fromDate(new Date(q.quoteDate)), validTillDate: Timestamp.fromDate(new Date(q.validTillDate)), createdAt: Timestamp.fromDate(new Date(q.createdAt)), lastUpdatedAt: Timestamp.fromDate(new Date(q.lastUpdatedAt)) }));
        if (backupData.returns) backupData.returns.forEach(r => batch.set(doc(db, `users/${userId}/returns`, r.id), { ...r, returnDate: Timestamp.fromDate(new Date(r.returnDate)), createdAt: Timestamp.fromDate(new Date(r.createdAt)) }));
        if (backupData.businessTransactions) backupData.businessTransactions.forEach(bt => batch.set(doc(db, `users/${userId}/businessTransactions`, bt.id), { ...bt, date: Timestamp.fromDate(new Date(bt.date)) }));
        if (backupData.activityLog) backupData.activityLog.forEach(al => batch.set(doc(db, `users/${userId}/activityLog`, al.id), { ...al, timestamp: Timestamp.fromDate(new Date(al.timestamp)) }));

        const appSettingsRef = doc(db, `users/${userId}/settings`, "app_config");
        const currentAppSettings = await getAppSettingsFromFirestore(userId); 
        const settingsToRestore: AppSettings = {
          ...backupData.appSettingsSnapshot,
          backupConfig: currentAppSettings.backupConfig, 
          lastUpdated: serverTimestamp() as any,
        };
        batch.set(appSettingsRef, settingsToRestore);

        await batch.commit();

        const activityEntry = await generateActivityEntryForUser(userId, {
            type: "DATA_RESTORE",
            description: `Data restored successfully from backup: ${backupDocument.description} (ID: ${backupId}).`,
            details: { backupId, description: backupDocument.description }
        });

        return { success: true, message: `Data restored from backup "${backupDocument.description}".`, activityEntry };
    } catch (error) {
        return catchFirebaseError(error, 'restoreFromBackup', `users/${userId}/${BACKUPS_COLLECTION}/${backupId}`);
    }
};


export const deleteBackup = async (userId: string, backupId: string): Promise<{ success: boolean; message: string; activityEntry?: ActivityLogEntry }> => {
    ensureFirestoreInitialized();
    if (!userId || !backupId || !db) throw new Error("User ID, Backup ID, and Firestore instance are required.");

    const backupDocRef = doc(db, `users/${userId}/${BACKUPS_COLLECTION}`, backupId);
    try {
        const backupSnap = await getDoc(backupDocRef);
        if (!backupSnap.exists()) {
            throw new Error(`Backup with ID ${backupId} not found.`);
        }
        const backupDescription = backupSnap.data().description || `Backup ${backupId}`;

        await deleteDoc(backupDocRef);

        const activityEntry = await generateActivityEntryForUser(userId, {
            type: "DATA_BACKUP", 
            description: `Backup deleted: ${backupDescription} (ID: ${backupId}).`,
            details: { backupId, description: backupDescription, action: "delete" }
        });
        return { success: true, message: `Backup "${backupDescription}" deleted successfully.`, activityEntry };
    } catch (error) {
        return catchFirebaseError(error, 'deleteBackup', `users/${userId}/${BACKUPS_COLLECTION}/${backupId}`);
    }
};


export const deleteAllBackupsForUser = async (userId: string): Promise<{deletedCount: number}> => {
    ensureFirestoreInitialized();
    if (!userId) throw new Error("User ID required to delete all backups.");
    try {
        const result = await batchDeleteCollection(userId, BACKUPS_COLLECTION);
        await generateActivityEntryForUser(userId, {
            type: "DATA_BACKUP",
            description: `All ${result.deletedCount} backups have been deleted.`,
            details: { action: "deleteAllBackups", count: result.deletedCount }
        });
        return result;
    } catch (error) {
        return catchFirebaseError(error, 'deleteAllBackupsForUser', `users/${userId}/${BACKUPS_COLLECTION}`);
    }
};