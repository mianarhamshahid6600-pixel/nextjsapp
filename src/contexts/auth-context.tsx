
"use client";

import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import type { ReactNode} from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth as firebaseAuthInstance, firebaseInitializationError as GlobalFirebaseInitializationError } from "@/lib/firebase/clientApp";
import { useRouter, usePathname } from "next/navigation";
import type { AppSettings, CoreAppData, Product, Customer, Supplier, Sale, PurchaseInvoice, Quotation, Return as ReturnType } from "@/lib/data-types";
import { getAppSettingsFromFirestore } from "@/lib/services/app-settings-service";
import { initialAppSettings } from "@/lib/data";
import { performAutomaticClientBackup } from "@/lib/services/backup-service";
import { differenceInDays, differenceInHours } from 'date-fns';
import { getProductsForUser } from "@/lib/services/product-service";
import { getCustomersForUser } from "@/lib/services/customer-service";
import { getSuppliersForUser } from "@/lib/services/supplier-service";
import { getSalesForUser } from "@/lib/services/sale-service";
import { getPurchaseInvoicesForUser } from "@/lib/services/purchase-service";
import { getQuotationsForUser } from "@/lib/services/quotation-service";
import { getReturnsForUser } from "@/lib/services/return-service";


interface AuthContextType {
  user: User | null;
  isLoading: boolean; // Tracks auth state and settings/core data loading
  isCoreDataLoading: boolean; // Specific flag for when core data is being re-fetched
  userId: string | null;
  authError: string | null;
  appSettings: AppSettings;
  coreAppData: CoreAppData;
  currencyForConversionSource: string | null;
  refreshAuthContext: (refreshCoreData?: boolean) => Promise<void>;
  showInitialSetupModal: boolean;
  setShowInitialSetupModal: (show: boolean) => void;
}

const initialCoreAppData: CoreAppData = {
  products: [], customers: [], suppliers: [], sales: [],
  purchaseInvoices: [], quotations: [], returns: []
};

const defaultAuthContextValue: AuthContextType = {
  user: null,
  isLoading: true,
  isCoreDataLoading: true,
  userId: null,
  authError: null,
  appSettings: { ...initialAppSettings },
  coreAppData: { ...initialCoreAppData },
  currencyForConversionSource: null,
  refreshAuthContext: async () => {},
  showInitialSetupModal: false,
  setShowInitialSetupModal: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContextValue);

let autoBackupCheckPerformedThisSession = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCoreDataLoading, setIsCoreDataLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({ ...initialAppSettings });
  const [coreAppData, setCoreAppData] = useState<CoreAppData>({ ...initialCoreAppData });
  const [currencyForConversionSource, setCurrencyForConversionSource] = useState<string | null>(null);
  const [showInitialSetupModal, setShowInitialSetupModal] = useState<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();

    const attemptAutomaticClientBackup = async (currentUserId: string, currentAppSettings: AppSettings) => {
    if (autoBackupCheckPerformedThisSession) return;
    autoBackupCheckPerformedThisSession = true; 

    const { backupConfig } = currentAppSettings;
    if (!backupConfig || backupConfig.autoBackupFrequency === 'disabled') {
      return;
    }

    const lastAutoBackupTimestamp = backupConfig.lastAutoBackupTimestamp ? new Date(backupConfig.lastAutoBackupTimestamp) : null;
    const now = new Date();
    let shouldBackup = false;

    if (!lastAutoBackupTimestamp) { 
      shouldBackup = true;
    } else {
      switch (backupConfig.autoBackupFrequency) {
        case 'daily':
          if (differenceInHours(now, lastAutoBackupTimestamp) >= 24) shouldBackup = true;
          break;
        case 'weekly':
          if (differenceInDays(now, lastAutoBackupTimestamp) >= 7) shouldBackup = true;
          break;
        case 'monthly':
          if (differenceInDays(now, lastAutoBackupTimestamp) >= 30) shouldBackup = true;
          break;
      }
    }

    if (shouldBackup) {
      console.log(`Client-side auto-backup triggered for frequency: ${backupConfig.autoBackupFrequency}`);
      try {
        await performAutomaticClientBackup(currentUserId, currentAppSettings);
        const updatedSettings = await getAppSettingsFromFirestore(currentUserId);
        setAppSettings(updatedSettings);
      } catch (backupError) {
        console.error("Client-side automatic backup attempt failed:", backupError);
      }
    }
  };

  const fetchCoreData = async (currentUserId: string): Promise<CoreAppData> => {
      const [
          products, customers, suppliers, sales,
          purchaseInvoices, quotations, returns
      ] = await Promise.all([
          getProductsForUser(currentUserId),
          getCustomersForUser(currentUserId),
          getSuppliersForUser(currentUserId),
          getSalesForUser(currentUserId, 'all_time'),
          getPurchaseInvoicesForUser(currentUserId, 'all_time'),
          getQuotationsForUser(currentUserId, 'all_time'),
          getReturnsForUser(currentUserId, 'all_time'),
      ]);
      return { products, customers, suppliers, sales, purchaseInvoices, quotations, returns };
  };


  const fetchUserAndSettings = useCallback(async (currentAuthUser: User | null) => {
    setIsLoading(true);
    const previousContextCurrency = appSettings.currency;
    let operationError: string | null = null;

    if (currentAuthUser) {
      setUser(currentAuthUser);
      setUserId(currentAuthUser.uid);
      try {
        const settings = await getAppSettingsFromFirestore(currentAuthUser.uid);
        setAppSettings(settings);
        if (settings.currency !== previousContextCurrency && previousContextCurrency) {
          setCurrencyForConversionSource(previousContextCurrency);
        } else {
          setCurrencyForConversionSource(null);
        }
        setShowInitialSetupModal(!settings.hasCompletedInitialSetup);

        if(settings.hasCompletedInitialSetup) {
           setIsCoreDataLoading(true);
           const data = await fetchCoreData(currentAuthUser.uid);
           setCoreAppData(data);
           setIsCoreDataLoading(false);
           await attemptAutomaticClientBackup(currentAuthUser.uid, settings);
        } else {
            setIsCoreDataLoading(false);
            setCoreAppData(initialCoreAppData);
        }

      } catch (settingsError: any) {
        operationError = `Failed to load app settings: ${settingsError.message}. Using defaults.`;
        console.error(operationError, settingsError);
        const defaults = { ...initialAppSettings, hasCompletedInitialSetup: false };
        setAppSettings(defaults);
        setShowInitialSetupModal(!defaults.hasCompletedInitialSetup);
        setIsCoreDataLoading(false);
      }
    } else {
      setUser(null);
      setUserId(null);
      setAppSettings({ ...initialAppSettings });
      setCoreAppData({ ...initialCoreAppData });
      setCurrencyForConversionSource(null);
      setShowInitialSetupModal(false);
      setIsCoreDataLoading(false);
    }
    
    setIsLoading(false);

    if (GlobalFirebaseInitializationError) {
      setAuthError(`Firebase initialization failed: ${GlobalFirebaseInitializationError.message}. Check config & services.`);
    } else if (operationError) {
      setAuthError(operationError);
    } else {
      setAuthError(null);
    }
  }, [appSettings.currency]);


  const refreshAuthContext = useCallback(async (refreshCoreData = false) => {
    if (firebaseAuthInstance?.currentUser) {
      setIsLoading(true);
       if (refreshCoreData) {
          setIsCoreDataLoading(true);
          const data = await fetchCoreData(firebaseAuthInstance.currentUser.uid);
          setCoreAppData(data);
          setIsCoreDataLoading(false);
       }
      await fetchUserAndSettings(firebaseAuthInstance.currentUser);
      setIsLoading(false);
    } else {
      await fetchUserAndSettings(null);
    }
  }, [fetchUserAndSettings]);

  useEffect(() => {
    if (GlobalFirebaseInitializationError) {
      setAuthError(`Firebase initialization failed: ${GlobalFirebaseInitializationError.message}. Check config & services.`);
      setIsLoading(false);
      setIsCoreDataLoading(false);
      return;
    }

    if (!firebaseAuthInstance) {
      setAuthError("Firebase Auth service is not available.");
      setIsLoading(false);
      setIsCoreDataLoading(false);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, (authUser) => {
        autoBackupCheckPerformedThisSession = false;
        fetchUserAndSettings(authUser);
    },
      (error) => {
        console.error("Firebase onAuthStateChanged error:", error);
        setAuthError(`Authentication state error: ${error.message}`);
        setIsLoading(false);
        setIsCoreDataLoading(false);
      }
    );

    return () => unsubscribe();
  }, [fetchUserAndSettings]);

   useEffect(() => {
    if (currencyForConversionSource) {
        const timer = setTimeout(() => {
            setCurrencyForConversionSource(null);
        }, 0);
        return () => clearTimeout(timer);
    }
  }, [currencyForConversionSource]);

   useEffect(() => {
    if (isLoading || authError) return;
    
    const publicPaths = ['/login', '/register', '/welcome', '/auth/email-verified'];
    const isPublicPath = publicPaths.includes(pathname);

    if (!user && !isPublicPath) {
        router.push('/login');
    } else if (user && isPublicPath) {
        if (appSettings.hasCompletedInitialSetup) {
            router.push('/dashboard');
        }
    }
  }, [user, isLoading, authError, router, pathname, appSettings.hasCompletedInitialSetup]);


  return (
    <AuthContext.Provider value={{
        user,
        isLoading,
        isCoreDataLoading,
        userId,
        authError,
        appSettings,
        coreAppData,
        currencyForConversionSource,
        refreshAuthContext,
        showInitialSetupModal,
        setShowInitialSetupModal
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider. Context is undefined.");
  }
  return context;
}
