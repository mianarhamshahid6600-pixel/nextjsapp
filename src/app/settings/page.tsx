

"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Palette, Monitor, Sun, Moon, AlertTriangle, Save, Loader2, DatabaseZap, Trash2, SlidersHorizontal, Building, Users, UserX, ListPlus, Tag, UploadCloud, RefreshCw, DownloadCloud, Info, Eye, BellRing, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppSettings, BackupRecord, BackupConfig } from "@/lib/data-types";
import { updateAppSettingsInFirestore } from "@/lib/services/app-settings-service";
import { resetAccountDataForUser, deleteUserAccountAndData } from "@/lib/services/account-service";
import { performManualBackup, listBackups, restoreFromBackup, deleteBackup } from "@/lib/services/backup-service";
import { initialAppSettings } from "@/lib/data";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { format } from 'date-fns';


export const availableCurrencies = [
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "INR", name: "Indian Rupee" },
  { code: "AED", name: "UAE Dirham" },
];

type AutoBackupFrequency = BackupConfig['autoBackupFrequency'];
const autoBackupFrequencies: { value: AutoBackupFrequency; label: string }[] = [
    { value: 'disabled', label: 'Disabled' },
    { value: 'daily', label: 'Daily (approx. 24 hours)' },
    { value: 'weekly', label: 'Weekly (approx. 7 days)' },
    { value: 'monthly', label: 'Monthly (approx. 30 days)' },
];


export default function SettingsPage() {
  const { setTheme, theme } = useTheme();
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings: contextAppSettings, authError, refreshAuthContext } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [pageAppSettings, setPageAppSettings] = useState<AppSettings>(contextAppSettings || initialAppSettings);

  const [lowStockInput, setLowStockInput] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [companyNameInput, setCompanyNameInput] = useState<string>("");
  const [walkInCustomerNameInput, setWalkInCustomerNameInput] = useState<string>("");
  const [newCategoryInput, setNewCategoryInput] = useState<string>("");
  const [currentBackupConfig, setCurrentBackupConfig] = useState<BackupConfig>(initialAppSettings.backupConfig!);
  const [selectedObfuscationCharacter, setSelectedObfuscationCharacter] = useState<'*' | '•'>(initialAppSettings.obfuscationCharacter);
  const [toastDurationInput, setToastDurationInput] = useState<string>("");


  const [availableBackups, setAvailableBackups] = useState<BackupRecord[]>([]);
  const [selectedBackupToRestore, setSelectedBackupToRestore] = useState<string>("");
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);


  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [isSavingCurrency, setIsSavingCurrency] = useState(false);
  const [isSavingCompanyName, setIsSavingCompanyName] = useState(false);
  const [isSavingWalkInName, setIsSavingWalkInName] = useState(false);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [isPerformingManualBackup, setIsPerformingManualBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSavingBackupConfig, setIsSavingBackupConfig] = useState(false);
  const [isDeletingBackup, setIsDeletingBackup] = useState<string | null>(null);
  const [isSavingObfuscationCharacter, setIsSavingObfuscationCharacter] = useState(false);
  const [isSavingToastDuration, setIsSavingToastDuration] = useState(false);


  const [isResettingAccount, setIsResettingAccount] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);


  useEffect(() => {
    setMounted(true);
    if (contextAppSettings) {
      setPageAppSettings(contextAppSettings);
      setLowStockInput(contextAppSettings.lowStockThreshold.toString());
      setSelectedCurrency(contextAppSettings.currency);
      setCompanyNameInput(contextAppSettings.companyDisplayName || initialAppSettings.companyDisplayName || "");
      setWalkInCustomerNameInput(contextAppSettings.walkInCustomerDefaultName || initialAppSettings.walkInCustomerDefaultName || "");
      setCurrentBackupConfig(contextAppSettings.backupConfig || initialAppSettings.backupConfig);
      setSelectedObfuscationCharacter(contextAppSettings.obfuscationCharacter || initialAppSettings.obfuscationCharacter);
      setToastDurationInput((contextAppSettings.toastDuration / 1000).toString());
    }
  }, [contextAppSettings]);

  const fetchBackups = useCallback(async () => {
    if (!userId) return;
    setIsLoadingBackups(true);
    try {
      const backups = await listBackups(userId);
      setAvailableBackups(backups);
    } catch (error: any) {
      toast({ title: "Error Listing Backups", description: error.message, variant: "destructive" });
      setAvailableBackups([]);
    } finally {
      setIsLoadingBackups(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (userId) {
      fetchBackups();
    }
  }, [userId, fetchBackups]); 


  const handleSaveSettings = async (settingsToUpdate: Partial<AppSettings>, operationType?: string, successMessage?: string) => {
     if (!userId) {
      toast({ title: "Error", description: "You must be logged in to change settings.", variant: "destructive" });
      return false;
    }

    let setLoadingState: ((loading: boolean) => void) | undefined;
    switch (operationType) {
        case "lowStock": setLoadingState = setIsSavingThreshold; break;
        case "currency": setLoadingState = setIsSavingCurrency; break;
        case "companyName": setLoadingState = setIsSavingCompanyName; break;
        case "walkInName": setLoadingState = setIsSavingWalkInName; break;
        case "categories": setLoadingState = setIsManagingCategories; break;
        case "backupConfig": setLoadingState = setIsSavingBackupConfig; break;
        case "obfuscationCharacter": setLoadingState = setIsSavingObfuscationCharacter; break;
        case "toastDuration": setLoadingState = setIsSavingToastDuration; break;
    }
    setLoadingState?.(true);

    try {
      // Use the most current pageAppSettings for the update to ensure atomicity against its state
      const { updatedSettings, activityEntry } = await updateAppSettingsInFirestore(userId, pageAppSettings, settingsToUpdate);
      setPageAppSettings(updatedSettings); 
      setCurrentBackupConfig(updatedSettings.backupConfig); 
      setSelectedObfuscationCharacter(updatedSettings.obfuscationCharacter);

      await refreshAuthContext(); 
      toast({
        title: "Settings Saved",
        description: successMessage || activityEntry?.description || "Settings updated successfully.",
      });
      return true;
    } catch (error: any) {
        toast({
            title: "Error Saving Settings",
            description: error.message || "Could not save settings.",
            variant: "destructive",
        });
        return false;
    } finally {
      setLoadingState?.(false);
    }
  };


  const handleLowStockThresholdChange = () => {
    const newThreshold = parseInt(lowStockInput, 10);
    if (isNaN(newThreshold) || newThreshold < 0) {
      toast({ title: "Invalid Input", description: "Low stock threshold must be a non-negative number.", variant: "destructive" });
      return;
    }
    if (newThreshold !== pageAppSettings.lowStockThreshold) {
        handleSaveSettings({ lowStockThreshold: newThreshold }, "lowStock");
    } else {
        toast({ title: "No Change", description: "Low stock threshold is already set to this value.", variant: "default"});
    }
  };

  const handleCurrencyChange = (newCurrency: string) => {
    if (newCurrency && newCurrency !== pageAppSettings.currency) {
      setSelectedCurrency(newCurrency);
      handleSaveSettings({ currency: newCurrency }, "currency");
    }
  };

  const handleCompanyNameSave = () => {
    const newName = companyNameInput.trim();
    if (!newName) {
        toast({ title: "Invalid Input", description: "Company display name cannot be empty.", variant: "destructive"});
        return;
    }
    if (newName !== (pageAppSettings.companyDisplayName || "")) {
        handleSaveSettings({ companyDisplayName: newName }, "companyName");
    } else {
        toast({ title: "No Change", description: "Company display name is already set to this value.", variant: "default"});
    }
  };

  const handleWalkInCustomerNameSave = () => {
    const newName = walkInCustomerNameInput.trim();
    if (!newName) {
        toast({ title: "Invalid Input", description: "Walk-in customer name cannot be empty.", variant: "destructive"});
        return;
    }
    if (newName !== (pageAppSettings.walkInCustomerDefaultName || "")) {
        handleSaveSettings({ walkInCustomerDefaultName: newName }, "walkInName");
    } else {
        toast({ title: "No Change", description: "Walk-in customer name is already set to this value.", variant: "default"});
    }
  };

  const handleAddCategory = async () => {
    const categoryToAdd = newCategoryInput.trim();
    if (!categoryToAdd) {
        toast({ title: "Category Required", description: "Category name cannot be empty.", variant: "destructive" });
        return;
    }
    if (pageAppSettings.knownCategories?.map(c => c.toLowerCase()).includes(categoryToAdd.toLowerCase())) {
        toast({ title: "Category Exists", description: `Category "${categoryToAdd}" already exists.`, variant: "default" });
        setNewCategoryInput("");
        return;
    }
    const updatedCategories = [...(pageAppSettings.knownCategories || []), categoryToAdd].sort((a, b) => a.localeCompare(b));
    const success = await handleSaveSettings({ knownCategories: updatedCategories }, "categories");
    if (success) {
        setNewCategoryInput("");
    }
  };

  const handleRemoveCategory = async (categoryToRemove: string) => {
    const updatedCategories = (pageAppSettings.knownCategories || []).filter(cat => cat !== categoryToRemove);
    await handleSaveSettings({ knownCategories: updatedCategories }, "categories");
  };

  const handleManualBackup = async () => {
    if (!userId) return;
    setIsPerformingManualBackup(true);
    try {
        const result = await performManualBackup(userId, pageAppSettings);
        toast({ title: "Backup Successful", description: `Backup "${result.description}" created. ID: ${result.backupId}`});
        await refreshAuthContext(); 
        fetchBackups(); 
    } catch (error: any) {
        toast({title: "Backup Failed", description: error.message, variant: "destructive"});
    } finally {
        setIsPerformingManualBackup(false);
    }
  };

  const handleRestoreData = async () => {
    if (!userId || !selectedBackupToRestore) {
        toast({ title: "Error", description: "No backup selected for restore.", variant: "destructive" });
        return;
    }
    setIsRestoring(true);
    try {
        const result = await restoreFromBackup(userId, selectedBackupToRestore);
        if (result.success) {
            toast({ title: "Restore Successful", description: result.message, duration: 10000 });
            await refreshAuthContext(true); 
            
            router.replace("/dashboard"); 
        } else {
            toast({ title: "Restore Failed", description: result.message, variant: "destructive", duration: 10000 });
        }
    } catch (error: any) {
        toast({ title: "Restore Error", description: error.message, variant: "destructive", duration: 10000 });
    } finally {
        setIsRestoring(false);
        setIsRestoreConfirmOpen(false);
        setSelectedBackupToRestore("");
        fetchBackups(); 
    }
  };

  const handleAutoBackupFrequencyChange = (frequency: AutoBackupFrequency) => {
    const newBackupConfig: BackupConfig = {
        ...(pageAppSettings.backupConfig || initialAppSettings.backupConfig), // Ensure all properties of BackupConfig are present
        autoBackupFrequency: frequency,
    };
    handleSaveSettings({ backupConfig: newBackupConfig }, "backupConfig", `Automatic backup frequency set to ${frequency}.`);
  };
  
  const handleDeleteSingleBackup = async (backupId: string) => {
      if (!userId || !backupId) return;
      setIsDeletingBackup(backupId);
      try {
          const result = await deleteBackup(userId, backupId);
          if (result.success) {
              toast({ title: "Backup Deleted", description: result.message });
              fetchBackups(); 
              if (selectedBackupToRestore === backupId) setSelectedBackupToRestore("");
          } else {
              toast({ title: "Error Deleting Backup", description: result.message, variant: "destructive" });
          }
      } catch (error: any) {
          toast({ title: "Error Deleting Backup", description: error.message, variant: "destructive" });
      } finally {
          setIsDeletingBackup(null);
      }
  };

  const handleSaveObfuscationCharacter = () => {
    if (selectedObfuscationCharacter !== pageAppSettings.obfuscationCharacter) {
        handleSaveSettings({ obfuscationCharacter: selectedObfuscationCharacter }, "obfuscationCharacter", `Obfuscation character set to "${selectedObfuscationCharacter}".`);
    } else {
        toast({ title: "No Change", description: "Obfuscation character is already set to this value.", variant: "default" });
    }
  };

  const handleSaveToastDuration = () => {
    const newDurationInSeconds = parseFloat(toastDurationInput);
    if (isNaN(newDurationInSeconds) || newDurationInSeconds <= 0) {
      toast({ title: "Invalid Input", description: "Toast duration must be a positive number of seconds.", variant: "destructive" });
      return;
    }
    const newDurationInMs = newDurationInSeconds * 1000;
    if (newDurationInMs !== pageAppSettings.toastDuration) {
        handleSaveSettings({ toastDuration: newDurationInMs }, "toastDuration");
    } else {
        toast({ title: "No Change", description: "Toast duration is already set to this value.", variant: "default"});
    }
  };


  const handleResetAccountData = async () => {
    if (!userId) {
      toast({ title: "Error", description: "User ID not found.", variant: "destructive" });
      return;
    }
    setIsResettingAccount(true);
    try {
      await resetAccountDataForUser(userId);
      toast({
        title: "Account Data Reset",
        description: "All business data has been cleared. Please complete the initial setup again.",
        variant: "default",
        duration: 10000,
      });
      await refreshAuthContext();
      if (!contextAppSettings.hasCompletedInitialSetup) {
         router.push("/dashboard");
      }
    } catch (error: any) {
      toast({ title: "Error Resetting Account", description: error.message || "Could not reset account data.", variant: "destructive" });
    } finally {
      setIsResettingAccount(false);
      setIsResetConfirmOpen(false);
    }
  };

  const handleDeleteUserAccount = async () => {
    if (!userId) {
      toast({ title: "Error", description: "User ID not found.", variant: "destructive" });
      return;
    }
    setIsDeletingAccount(true);
    const result = await deleteUserAccountAndData(userId);
    if (result.success) {
        toast({
            title: "Account Deleted",
            description: result.message,
            variant: "default",
            duration: 10000,
        });
    } else {
        toast({
            title: "Error Deleting Account",
            description: result.message,
            variant: "destructive",
            duration: 10000,
        });
    }
    setIsDeletingAccount(false);
    setIsDeleteAccountConfirmOpen(false);
  }


  if (!mounted || authLoading || !contextAppSettings || authError) {
    return (
       <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading settings...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to manage settings.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <Palette className="mr-2 h-5 w-5 text-primary" /> Theme Settings
          </CardTitle>
          <CardDescription>Choose your preferred application theme.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Current theme: <span className="font-semibold capitalize">{theme}</span></p>
          <div className="flex gap-2 flex-wrap">
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" /> Light
            </Button>
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" /> Dark
            </Button>
            <Button variant={theme === "system" ? "default" : "outline"} onClick={() => setTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" /> System
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <Printer className="mr-2 h-5 w-5 text-primary" /> Print Settings
          </CardTitle>
          <CardDescription>Configure receipt printing options.</CardDescription>
        </CardHeader>
        <CardContent>
            {/* Future printing settings can go here */}
            <p className="text-sm text-muted-foreground">Printing options for receipts and invoices will be available here in a future update.</p>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <BellRing className="mr-2 h-5 w-5 text-primary" /> Notification Settings
          </CardTitle>
          <CardDescription>Customize notification behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="toastDuration">Default Toast Duration (in seconds)</Label>
            <div className="flex gap-2 items-center mt-1">
              <Input
                id="toastDuration"
                type="number"
                value={toastDurationInput}
                onChange={(e) => setToastDurationInput(e.target.value)}
                min="0.5"
                step="0.1"
                className="max-w-xs"
                disabled={isSavingToastDuration}
              />
              <Button onClick={handleSaveToastDuration} disabled={isSavingToastDuration}>
                {isSavingToastDuration ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSavingToastDuration ? "Saving..." : "Save Duration"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
                This sets the default time a notification stays on screen. Very important messages may have a longer, fixed duration.
            </p>
          </div>
        </CardContent>
      </Card>

       <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <UploadCloud className="mr-2 h-5 w-5 text-primary" /> Data Backup & Restore
          </CardTitle>
          <CardDescription>Manage your application data backups. Backups are stored in Firestore.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="font-semibold mb-2">Manual Backup</h4>
            <Button onClick={handleManualBackup} disabled={isPerformingManualBackup || isRestoring}>
              {isPerformingManualBackup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {isPerformingManualBackup ? "Backing up..." : "Backup Data Now"}
            </Button>
            {pageAppSettings.backupConfig?.lastManualBackupTimestamp && (
              <p className="text-xs text-muted-foreground mt-1">
                Last manual backup: {format(new Date(pageAppSettings.backupConfig.lastManualBackupTimestamp), "PPpp")}
              </p>
            )}
          </div>
          <Separator/>
          <div>
            <h4 className="font-semibold mb-1">Automatic Backup Configuration</h4>
            <p className="text-xs text-muted-foreground mb-1">
                Select your preferred frequency for automatic backups. These backups are client-triggered when the app is opened and the interval has passed. For guaranteed background scheduling, server-side setup (e.g., Cloud Functions) is recommended.
            </p>
            <p className="text-xs text-muted-foreground mb-2">
                Custom day/hour selection is not currently available through this UI.
            </p>
            <div className="flex items-center gap-2">
                <Select
                    value={currentBackupConfig.autoBackupFrequency}
                    onValueChange={(value: AutoBackupFrequency) => handleAutoBackupFrequencyChange(value)}
                    disabled={isSavingBackupConfig}
                >
                    <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {autoBackupFrequencies.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {isSavingBackupConfig && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>
             {pageAppSettings.backupConfig?.lastAutoBackupTimestamp && (
              <p className="text-xs text-muted-foreground mt-1">
                Last automatic backup (client-triggered): {format(new Date(pageAppSettings.backupConfig.lastAutoBackupTimestamp), "PPpp")}
              </p>
            )}
          </div>
          <Separator/>
          <div>
            <h4 className="font-semibold mb-2">Restore from Backup</h4>
            {isLoadingBackups ? (
              <div className="flex items-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading backups...</div>
            ) : availableBackups.length > 0 ? (
              <div className="space-y-3">
                <Select value={selectedBackupToRestore} onValueChange={setSelectedBackupToRestore} disabled={isRestoring}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select a backup to restore..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBackups.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.description} (v{b.version}) - {format(new Date(b.createdAt), "PPp")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 items-center">
                    <AlertDialog open={isRestoreConfirmOpen} onOpenChange={setIsRestoreConfirmOpen}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={!selectedBackupToRestore || isRestoring || isPerformingManualBackup}>
                                <RefreshCw className="mr-2 h-4 w-4"/> Restore Selected Backup
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-destructive">Restore Data Confirmation</AlertDialogTitle>
                                <div className="text-sm text-muted-foreground space-y-2">
                                    <div className="font-semibold text-base text-destructive">WARNING: This action is irreversible!</div>
                                    <div>Restoring from backup will <strong className="text-destructive">COMPLETELY OVERWRITE</strong> all your current data (products, sales, customers, settings, etc.) with the data from the selected backup: <br/><strong>{availableBackups.find(b => b.id === selectedBackupToRestore)?.description}</strong>.</div>
                                    <div className="mt-2">Any data created or modified after this backup was made will be permanently lost. Are you absolutely sure you want to proceed?</div>
                                </div>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleRestoreData} disabled={isRestoring} className="bg-destructive hover:bg-destructive/90">
                                    {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                    {isRestoring ? "Restoring..." : "Yes, Overwrite and Restore"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    {selectedBackupToRestore && (
                        <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => handleDeleteSingleBackup(selectedBackupToRestore)} 
                            disabled={isDeletingBackup === selectedBackupToRestore || isRestoring}
                            title="Delete selected backup"
                        >
                            {isDeletingBackup === selectedBackupToRestore ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive"/>}
                        </Button>
                    )}
                 </div>

              </div>
            ) : (
              <p className="text-muted-foreground">No backups available to restore.</p>
            )}
            <Button variant="link" size="sm" onClick={fetchBackups} disabled={isLoadingBackups || isRestoring} className="p-0 h-auto mt-1">
                <RefreshCw className="mr-1 h-3 w-3"/> Refresh backup list
            </Button>
          </div>
           <Separator/>
           <div>
             <h4 className="font-semibold mb-1 flex items-center"><Info className="mr-2 h-4 w-4 text-blue-500"/>Backup & Restore Notes</h4>
             <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 pl-2">
                <li>Backups include all products, customers, suppliers, sales, purchases, quotations, returns, financial transactions, and core app settings.</li>
                <li>Manual backups can be initiated at any time.</li>
                <li>Client-side automatic backups trigger only when the app is opened and the chosen interval has passed since the last automatic backup. For fully automated, scheduled background backups, server-side setup (e.g., Cloud Functions) is required.</li>
                <li>Restoring data is a destructive operation. It will replace all current data with the data from the selected backup. This action cannot be undone.</li>
             </ul>
           </div>
        </CardContent>
      </Card>


      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-primary" /> Inventory Settings
          </CardTitle>
          <CardDescription>Configure alerts for inventory management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
            <div className="flex gap-2 items-center mt-1">
              <Input
                id="lowStockThreshold"
                type="number"
                value={lowStockInput}
                onChange={(e) => setLowStockInput(e.target.value)}
                min="0"
                className="max-w-xs"
                disabled={isSavingThreshold}
              />
              <Button onClick={handleLowStockThresholdChange} disabled={isSavingThreshold}>
                {isSavingThreshold ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSavingThreshold ? "Saving..." : "Save Threshold"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <Tag className="mr-2 h-5 w-5 text-primary" /> Category Management
          </CardTitle>
          <CardDescription>Add or remove product categories for inventory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="newCategoryInput">New Category Name</Label>
            <div className="flex gap-2 items-center mt-1">
              <Input
                id="newCategoryInput"
                type="text"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                placeholder="e.g., Vitamins, Pain Relief"
                className="max-w-xs"
                disabled={isManagingCategories}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory();}}}
              />
              <Button onClick={handleAddCategory} disabled={isManagingCategories}>
                {isManagingCategories ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />}
                Add Category
              </Button>
            </div>
          </div>
          {pageAppSettings.knownCategories && pageAppSettings.knownCategories.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 mt-4">Existing Categories:</h4>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {pageAppSettings.knownCategories.sort((a,b) => a.localeCompare(b)).map(category => (
                  <div key={category} className="flex items-center justify-between p-1.5 bg-muted/50 rounded-sm">
                    <span className="text-sm">{category}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveCategory(category)}
                      disabled={isManagingCategories}
                      title={`Remove ${category}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove category ${category}</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <SlidersHorizontal className="mr-2 h-5 w-5 text-primary" /> General Application Settings
          </CardTitle>
          <CardDescription>Configure core application settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="companyDisplayName" className="flex items-center"><Building className="mr-2 h-4 w-4 text-muted-foreground" />Company Display Name</Label>
            <div className="flex gap-2 items-center mt-1">
              <Input
                id="companyDisplayName"
                type="text"
                value={companyNameInput}
                onChange={(e) => setCompanyNameInput(e.target.value)}
                placeholder="Your Company Name"
                className="max-w-xs"
                disabled={isSavingCompanyName}
              />
              <Button onClick={handleCompanyNameSave} disabled={isSavingCompanyName}>
                {isSavingCompanyName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSavingCompanyName ? "Saving..." : "Save Name"}
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <Label htmlFor="currencySelect">Application Currency</Label>
             <p className="text-xs text-muted-foreground mb-1">Current: {pageAppSettings.currency}</p>
            <Select
                value={selectedCurrency}
                onValueChange={handleCurrencyChange}
                disabled={isSavingCurrency}
            >
                <SelectTrigger id="currencySelect" className="max-w-xs">
                    <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                    {availableCurrencies.map(curr => (
                        <SelectItem key={curr.code} value={curr.code}>
                            {curr.name} ({curr.code})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
             {isSavingCurrency && (
                 <p className="text-sm text-primary mt-2 flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving currency...</p>
            )}
          </div>

          <Separator />

          <div>
            <Label htmlFor="walkInCustomerNameInput" className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground" />Default Walk-in Customer Name</Label>
            <div className="flex gap-2 items-center mt-1">
              <Input
                id="walkInCustomerNameInput"
                type="text"
                value={walkInCustomerNameInput}
                onChange={(e) => setWalkInCustomerNameInput(e.target.value)}
                placeholder="e.g., Counter Sale"
                className="max-w-xs"
                disabled={isSavingWalkInName}
              />
              <Button onClick={handleWalkInCustomerNameSave} disabled={isSavingWalkInName}>
                {isSavingWalkInName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSavingWalkInName ? "Saving..." : "Save Name"}
              </Button>
            </div>
          </div>
           <Separator />
           <div>
            <Label htmlFor="obfuscationCharacterSelect" className="flex items-center"><Eye className="mr-2 h-4 w-4 text-muted-foreground" />Obfuscation Character for Hidden Amounts</Label>
            <div className="flex gap-2 items-center mt-1">
                <Select
                    value={selectedObfuscationCharacter}
                    onValueChange={(value: '*' | '•') => setSelectedObfuscationCharacter(value)}
                    disabled={isSavingObfuscationCharacter}
                >
                    <SelectTrigger id="obfuscationCharacterSelect" className="max-w-xs">
                        <SelectValue placeholder="Select character" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="*">Star (*)</SelectItem>
                        <SelectItem value="•">Dot (•)</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={handleSaveObfuscationCharacter} disabled={isSavingObfuscationCharacter}>
                    {isSavingObfuscationCharacter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSavingObfuscationCharacter ? "Saving..." : "Save Character"}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">This character will be used to hide monetary values on the Financial Overview page when visibility is toggled off.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md border-destructive/50">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center text-destructive">
            <DatabaseZap className="mr-2 h-5 w-5" /> Data Management & Account Deletion
          </CardTitle>
          <CardDescription>Manage your account data or delete your account. These actions are irreversible.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <Label htmlFor="resetAccountData" className="text-base font-semibold block mb-1">Reset Account Data</Label>
                <p className="text-sm text-muted-foreground mb-2">This will delete all your business data but keep your login account active. Initial setup will be required again.</p>
                <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={isResettingAccount || isDeletingAccount}>
                            <Trash2 className="mr-2 h-4 w-4" /> Reset All Account Data
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure you want to reset data?</AlertDialogTitle>
                         <div className="text-sm text-muted-foreground space-y-2">
                            <div className="font-semibold text-base text-destructive">WARNING: This action is irreversible!</div>
                            <div>This action will permanently delete all your products, customers, suppliers, sales history, purchase invoices, quotations, returns, financial transactions, and backups.</div>
                            <div>Your login account will remain, but counters will be reset, and you will need to go through the initial setup again. This data cannot be recovered.</div>
                        </div>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel disabled={isResettingAccount}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetAccountData} disabled={isResettingAccount} className="bg-destructive hover:bg-destructive/90">
                            {isResettingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            {isResettingAccount ? "Resetting..." : "Yes, Delete All Business Data"}
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
            <Separator/>
             <div>
                <Label htmlFor="deleteUserAccount" className="text-base font-semibold block mb-1">Delete Entire Account</Label>
                <p className="text-sm text-muted-foreground mb-2">This will permanently delete your login account and all associated business data. This action cannot be undone.</p>
                <AlertDialog open={isDeleteAccountConfirmOpen} onOpenChange={setIsDeleteAccountConfirmOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="bg-red-700 hover:bg-red-800" disabled={isResettingAccount || isDeletingAccount}>
                            <UserX className="mr-2 h-4 w-4" /> Delete My Account Permanently
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure you want to delete your account?</AlertDialogTitle>
                        <div className="text-sm text-muted-foreground space-y-2">
                           <div className="font-semibold text-base text-destructive">FINAL WARNING: This action is irreversible!</div>
                           <div> This action will permanently delete your login credentials and all associated business data (including backups).</div>
                           <div>You will be logged out, and this data cannot be recovered.</div>
                        </div>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingAccount}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUserAccount} disabled={isDeletingAccount} className="bg-red-700 hover:bg-red-800 text-white">
                            {isDeletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            {isDeletingAccount ? "Deleting..." : "Yes, Delete My Account and All Data"}
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </CardContent>
      </Card>

    </div>
  );
}
