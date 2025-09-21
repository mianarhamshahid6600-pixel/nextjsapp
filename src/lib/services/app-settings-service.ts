

import type { AppSettings, ActivityLogEntry, BackupConfig } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { db } from '@/lib/firebase/clientApp';
import { doc, getDoc, setDoc as firestoreSetDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ensureFirestoreInitialized, catchFirebaseError } from './helpers';
import { generateActivityEntryForUser } from './activity-log-service';

const APP_SETTINGS_DOC_ID = "app_config";

export const getAppSettingsFromFirestore = async (userId: string): Promise<AppSettings> => {
  ensureFirestoreInitialized();
  if (!userId) return { ...initialAppSettings, currentBusinessCash: 0, hasCompletedInitialSetup: false, knownCategories: [], knownShopNames: [], backupConfig: { ...initialAppSettings.backupConfig }, obfuscationCharacter: initialAppSettings.obfuscationCharacter || '*' };
  if (!db) throw new Error("Firestore is not initialized.");

  const settingsDocRef = doc(db, `users/${userId}/settings`, APP_SETTINGS_DOC_ID);
  try {
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Use initialAppSettings.backupConfig as the base for defaults, which now uses null
      const baseBackupConfig = { ...initialAppSettings.backupConfig };
      return {
        ...initialAppSettings, // Start with defaults
        ...data, // Override with Firestore data
        lowStockThreshold: data.lowStockThreshold ?? initialAppSettings.lowStockThreshold,
        lastSaleNumericId: data.lastSaleNumericId ?? 0,
        lastCustomerNumericId: data.lastCustomerNumericId ?? 0,
        lastPurchaseNumericId: data.lastPurchaseNumericId ?? 0,
        lastQuotationNumericId: data.lastQuotationNumericId ?? 0,
        lastReturnNumericId: data.lastReturnNumericId ?? 0,
        currency: data.currency || initialAppSettings.currency,
        companyDisplayName: data.companyDisplayName || initialAppSettings.companyDisplayName,
        hasCompletedInitialSetup: data.hasCompletedInitialSetup || false,
        dateOfBirth: data.dateOfBirth === undefined ? initialAppSettings.dateOfBirth : data.dateOfBirth, // Handle undefined from Firestore if old data
        currentBusinessCash: data.currentBusinessCash ?? 0,
        walkInCustomerDefaultName: data.walkInCustomerDefaultName || initialAppSettings.walkInCustomerDefaultName,
        knownCategories: Array.isArray(data.knownCategories) ? data.knownCategories : initialAppSettings.knownCategories,
        knownShopNames: Array.isArray(data.knownShopNames) ? data.knownShopNames : initialAppSettings.knownShopNames,
        backupConfig: data.backupConfig ? { ...baseBackupConfig, ...data.backupConfig } : baseBackupConfig,
        obfuscationCharacter: data.obfuscationCharacter || initialAppSettings.obfuscationCharacter || '*',
        toastDuration: data.toastDuration ?? initialAppSettings.toastDuration,
        totalProducts: data.totalProducts ?? 0,
        totalSuppliers: data.totalSuppliers ?? 0,
      } as AppSettings;
    } else {
      // No settings doc exists, create one with initial defaults (which now uses null for optional timestamps)
      const initialSettingsWithDefaults: AppSettings = { ...initialAppSettings, currentBusinessCash: 0, hasCompletedInitialSetup: false };
      await firestoreSetDoc(settingsDocRef, initialSettingsWithDefaults);
      return initialSettingsWithDefaults;
    }
  } catch (error: any) {
    if (error.code === 'unavailable' || error.message?.toLowerCase().includes('offline') || error.message?.toLowerCase().includes('network error')) {
      console.warn(`Failed to fetch app settings due to offline state or network issue. Using default settings. Error: ${error.message}`);
      return { ...initialAppSettings, currentBusinessCash: 0, hasCompletedInitialSetup: false, knownCategories: initialAppSettings.knownCategories, knownShopNames: initialAppSettings.knownShopNames, backupConfig: { ...initialAppSettings.backupConfig }, obfuscationCharacter: initialAppSettings.obfuscationCharacter || '*' };
    }
    return catchFirebaseError(error, 'getAppSettingsFromFirestore', `users/${userId}/settings/${APP_SETTINGS_DOC_ID}`);
  }
};

export const updateAppSettingsInFirestore = async (
  userId: string,
  currentSettings: AppSettings,
  newSettings: Partial<AppSettings>
): Promise<{updatedSettings: AppSettings, activityEntry: ActivityLogEntry | null}> => {
  ensureFirestoreInitialized();
  if (!userId) throw new Error("User ID is required to update settings.");
  if (!db) throw new Error("Firestore is not initialized.");

  const settingsDocRef = doc(db, `users/${userId}/settings`, APP_SETTINGS_DOC_ID);

  const settingsToSave: Record<string, any> = {
    ...newSettings,
    lastUpdated: serverTimestamp(),
  };

  const settingKeys = Object.keys(initialAppSettings) as Array<keyof AppSettings>;
  for (const key of settingKeys) {
    if (newSettings[key] === undefined && currentSettings[key] !== undefined) {
      settingsToSave[key] = currentSettings[key];
    }
  }
  settingsToSave.lowStockThreshold = newSettings.lowStockThreshold ?? currentSettings.lowStockThreshold ?? initialAppSettings.lowStockThreshold;
  settingsToSave.lastSaleNumericId = newSettings.lastSaleNumericId ?? currentSettings.lastSaleNumericId ?? 0;
  settingsToSave.lastCustomerNumericId = newSettings.lastCustomerNumericId ?? currentSettings.lastCustomerNumericId ?? 0;
  settingsToSave.lastPurchaseNumericId = newSettings.lastPurchaseNumericId ?? currentSettings.lastPurchaseNumericId ?? 0;
  settingsToSave.lastQuotationNumericId = newSettings.lastQuotationNumericId ?? currentSettings.lastQuotationNumericId ?? 0;
  settingsToSave.lastReturnNumericId = newSettings.lastReturnNumericId ?? currentSettings.lastReturnNumericId ?? 0;
  settingsToSave.currency = newSettings.currency ?? currentSettings.currency ?? initialAppSettings.currency;
  settingsToSave.companyDisplayName = newSettings.companyDisplayName ?? currentSettings.companyDisplayName ?? initialAppSettings.companyDisplayName;
  settingsToSave.hasCompletedInitialSetup = newSettings.hasCompletedInitialSetup ?? currentSettings.hasCompletedInitialSetup ?? false;
  settingsToSave.dateOfBirth = newSettings.dateOfBirth !== undefined ? newSettings.dateOfBirth : (currentSettings.dateOfBirth ?? null);
  settingsToSave.currentBusinessCash = newSettings.currentBusinessCash ?? currentSettings.currentBusinessCash ?? 0;
  settingsToSave.walkInCustomerDefaultName = newSettings.walkInCustomerDefaultName ?? currentSettings.walkInCustomerDefaultName ?? initialAppSettings.walkInCustomerDefaultName;
  settingsToSave.knownCategories = Array.isArray(newSettings.knownCategories) ? newSettings.knownCategories : (currentSettings.knownCategories || initialAppSettings.knownCategories);
  settingsToSave.knownShopNames = Array.isArray(newSettings.knownShopNames) ? newSettings.knownShopNames : (currentSettings.knownShopNames || initialAppSettings.knownShopNames);
  settingsToSave.obfuscationCharacter = newSettings.obfuscationCharacter ?? currentSettings.obfuscationCharacter ?? initialAppSettings.obfuscationCharacter ?? '*';
  settingsToSave.toastDuration = newSettings.toastDuration ?? currentSettings.toastDuration ?? initialAppSettings.toastDuration;
  settingsToSave.totalProducts = newSettings.totalProducts ?? currentSettings.totalProducts ?? 0;
  settingsToSave.totalSuppliers = newSettings.totalSuppliers ?? currentSettings.totalSuppliers ?? 0;
  
  const currentBackupConf = currentSettings.backupConfig || initialAppSettings.backupConfig;
  const newBackupConfPartial = newSettings.backupConfig;
  settingsToSave.backupConfig = {
      autoBackupFrequency: newBackupConfPartial?.autoBackupFrequency ?? currentBackupConf.autoBackupFrequency,
      lastManualBackupTimestamp: (newBackupConfPartial?.lastManualBackupTimestamp !== undefined ? newBackupConfPartial.lastManualBackupTimestamp : currentBackupConf.lastManualBackupTimestamp) ?? null,
      lastAutoBackupTimestamp: (newBackupConfPartial?.lastAutoBackupTimestamp !== undefined ? newBackupConfPartial.lastAutoBackupTimestamp : currentBackupConf.lastAutoBackupTimestamp) ?? null,
  };


  try {
    await firestoreSetDoc(settingsDocRef, settingsToSave, { merge: true });

    const updatedDocSnap = await getDoc(settingsDocRef);
    const finalUpdatedSettings = updatedDocSnap.exists()
        ? { ...initialAppSettings, ...updatedDocSnap.data() } as AppSettings
        : { ...currentSettings, ...newSettings } as AppSettings;

    let activityEntry: ActivityLogEntry | null = null;
    const changes: string[] = [];
    let activityType: ActivityLogType = "SETTINGS_UPDATE";


    if (newSettings.lowStockThreshold !== undefined && newSettings.lowStockThreshold !== currentSettings.lowStockThreshold) {
        changes.push(`Low stock threshold to ${newSettings.lowStockThreshold}`);
    }
    if (newSettings.currency !== undefined && newSettings.currency !== currentSettings.currency) {
        changes.push(`Currency to ${newSettings.currency}`);
    }
    if (newSettings.companyDisplayName !== undefined && newSettings.companyDisplayName !== currentSettings.companyDisplayName) {
        changes.push(`Company display name to "${newSettings.companyDisplayName}"`);
    }
    if (newSettings.hasCompletedInitialSetup !== undefined && newSettings.hasCompletedInitialSetup !== currentSettings.hasCompletedInitialSetup) {
        changes.push(newSettings.hasCompletedInitialSetup ? "Initial setup completed" : "Initial setup marked incomplete");
    }
    if (newSettings.dateOfBirth !== undefined && newSettings.dateOfBirth !== currentSettings.dateOfBirth) {
        changes.push(`Date of birth updated`);
    }
    if (newSettings.currentBusinessCash !== undefined && newSettings.currentBusinessCash !== currentSettings.currentBusinessCash) {
        changes.push(`Business cash balance set to ${newSettings.currentBusinessCash.toFixed(2)}`);
    }
    if (newSettings.walkInCustomerDefaultName !== undefined && newSettings.walkInCustomerDefaultName !== currentSettings.walkInCustomerDefaultName) {
        changes.push(`Walk-in customer default name to "${newSettings.walkInCustomerDefaultName}"`);
    }
    if (newSettings.lastReturnNumericId !== undefined && newSettings.lastReturnNumericId !== currentSettings.lastReturnNumericId) {
        changes.push(`Last return numeric ID updated to ${newSettings.lastReturnNumericId}`);
    }
    if (newSettings.knownCategories !== undefined && JSON.stringify(newSettings.knownCategories.sort()) !== JSON.stringify((currentSettings.knownCategories || []).sort())) {
      changes.push(`Known categories list updated.`);
    }
    if (newSettings.knownShopNames !== undefined && JSON.stringify(newSettings.knownShopNames.sort()) !== JSON.stringify((currentSettings.knownShopNames || []).sort())) {
      changes.push(`Known shop names list updated.`);
      activityType = "SHOP_NAME_UPDATE";
    }
    if (newSettings.backupConfig) {
        const oldFreq = currentSettings.backupConfig?.autoBackupFrequency || 'disabled';
        const newFreq = newSettings.backupConfig.autoBackupFrequency;
        if (newFreq !== oldFreq) {
            changes.push(`Auto-backup frequency changed from ${oldFreq} to ${newFreq}`);
        }
        if (newSettings.backupConfig.lastManualBackupTimestamp !== undefined && newSettings.backupConfig.lastManualBackupTimestamp !== currentSettings.backupConfig?.lastManualBackupTimestamp) {
             changes.push(`Last manual backup timestamp updated.`);
        }
        if (newSettings.backupConfig.lastAutoBackupTimestamp !== undefined && newSettings.backupConfig.lastAutoBackupTimestamp !== currentSettings.backupConfig?.lastAutoBackupTimestamp) {
             changes.push(`Last automatic backup timestamp updated.`);
        }
    }
    if (newSettings.obfuscationCharacter !== undefined && newSettings.obfuscationCharacter !== currentSettings.obfuscationCharacter) {
        changes.push(`Obfuscation character for hidden amounts changed to "${newSettings.obfuscationCharacter}"`);
    }
    if (newSettings.toastDuration !== undefined && newSettings.toastDuration !== currentSettings.toastDuration) {
        changes.push(`Toast notification duration changed to ${newSettings.toastDuration / 1000}s`);
    }


    if (changes.length > 0) {
        const activityDescription = changes.length === 1 && (activityType === "SHOP_NAME_UPDATE" || activityType === "DATA_BACKUP") ? changes[0] : `Settings updated: ${changes.join(', ')}.`;
        activityEntry = await generateActivityEntryForUser(userId, {
            type: activityType,
            description: activityDescription,
            details: { updatedFields: Object.keys(newSettings).filter(k => newSettings[k as keyof AppSettings] !== undefined) }
        });
    }

    return { updatedSettings: finalUpdatedSettings, activityEntry };
  } catch (error) {
    return catchFirebaseError(error, 'updateAppSettingsInFirestore', `users/${userId}/settings/${APP_SETTINGS_DOC_ID}`);
  }
};
