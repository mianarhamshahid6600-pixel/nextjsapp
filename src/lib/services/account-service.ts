

import type { AppSettings } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { ensureFirestoreInitialized, catchFirebaseError, batchDeleteCollection } from './helpers';
import { generateActivityEntryForUser, clearActivityLogForUser } from './activity-log-service';
import { updateAppSettingsInFirestore, getAppSettingsFromFirestore } from './app-settings-service';
import { deleteAllProductsForUser } from './product-service';
import { deleteAllCustomersForUser } from './customer-service';
import { deleteAllSuppliersForUser } from './supplier-service';
import { deleteAllSalesForUser } from './sale-service';
import { deleteAllPurchaseInvoicesForUser } from './purchase-service';
import { deleteAllBusinessTransactionsForUser } from './financial-service';
import { deleteAllBackupsForUser } from './backup-service'; // Import backup service
import { auth } from '@/lib/firebase/clientApp';
import { deleteUser } from "firebase/auth";


export const resetAccountDataForUser = async (userId: string): Promise<void> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to reset account data.");

  console.warn(`Account data reset initiated for user: ${userId}. This will delete all their business data from Firestore.`);

  try {
    // Delete all data from subcollections
    const productsDeleted = await deleteAllProductsForUser(userId);
    console.log(`${productsDeleted.deletedCount} products deleted.`);

    const customersDeleted = await deleteAllCustomersForUser(userId);
    console.log(`${customersDeleted.deletedCount} customers deleted.`);

    const suppliersDeleted = await deleteAllSuppliersForUser(userId);
    console.log(`${suppliersDeleted.deletedCount} suppliers deleted.`);

    const salesDeleted = await deleteAllSalesForUser(userId);
    console.log(`${salesDeleted.deletedCount} sales deleted.`);

    const purchasesDeleted = await deleteAllPurchaseInvoicesForUser(userId);
    console.log(`${purchasesDeleted.deletedCount} purchase invoices deleted.`);

    const financialTxDeleted = await deleteAllBusinessTransactionsForUser(userId);
    console.log(`${financialTxDeleted.deletedCount} business transactions deleted.`);

    const backupsDeleted = await deleteAllBackupsForUser(userId); // Delete backups
    console.log(`${backupsDeleted.deletedCount} backups deleted.`);

    const activityLogCleared = await clearActivityLogForUser(userId);
    console.log(`Activity log entries cleared: ${activityLogCleared.deletedCount}`);

    // Reset AppSettings to initial values
    const currentSettings = await getAppSettingsFromFirestore(userId);

    const settingsToReset: Partial<AppSettings> = {
      ...initialAppSettings,
      lastSaleNumericId: 0,
      lastCustomerNumericId: 0,
      lastPurchaseNumericId: 0,
      lastQuotationNumericId: 0,
      lastReturnNumericId: 0,
      hasCompletedInitialSetup: false,
      currentBusinessCash: 0,
      totalProducts: 0, // Reset counter
      totalSuppliers: 0, // Reset counter
      currency: initialAppSettings.currency,
      companyDisplayName: initialAppSettings.companyDisplayName,
      dateOfBirth: initialAppSettings.dateOfBirth,
      knownCategories: [],
      knownShopNames: [],
      backupConfig: { // Reset backup config
        autoBackupFrequency: 'disabled',
        lastManualBackupTimestamp: undefined,
        lastAutoBackupTimestamp: undefined,
      }
    };

    await updateAppSettingsInFirestore(userId, currentSettings, settingsToReset);
    console.log("App settings reset in Firestore.");

    await generateActivityEntryForUser(userId, {
      type: "SETTINGS_UPDATE",
      description: "User account business data has been reset. All business data deleted, settings reverted to defaults. Initial setup required.",
      details: { action: "fullBusinessDataReset" }
    });
    console.log("Account data reset activity logged.");

  } catch (error) {
    return catchFirebaseError(error, "resetAccountDataForUser", `user_context/${userId}`);
  }
};


export const deleteUserAccountAndData = async (userId: string): Promise<{ success: boolean; message: string }> => {
  ensureFirestoreInitialized();
  if (!userId) return { success: false, message: "User ID is required." };

  const currentUser = auth?.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    return { success: false, message: "No authenticated user found or UID mismatch." };
  }

  try {
    // First, delete Firestore data.
    // resetAccountDataForUser handles its own activity logging for the data reset part.
    await resetAccountDataForUser(userId);
    console.log(`Business data for user ${userId} has been reset.`);

    // Then, delete the Firebase Auth user account
    await deleteUser(currentUser);
    console.log(`Firebase Auth account for user ${userId} has been deleted.`);

    // No need to explicitly sign out, deleteUser handles it.
    // The AuthProvider should detect the auth state change and redirect.

    return { success: true, message: "Account and all associated data successfully deleted. You will be logged out." };

  } catch (error: any) {
    console.error(`Error deleting user account and data for ${userId}:`, error);
    if (error.code === 'auth/requires-recent-login') {
      return {
        success: false,
        message: "This operation is sensitive and requires recent authentication. Please log out, log back in, and try again to delete your account."
      };
    }
    // Pass through other errors, potentially from resetAccountDataForUser or deleteUser.
    return {
      success: false,
      message: `Failed to delete account: ${error.message || "An unexpected error occurred."}`
    };
  }
};
