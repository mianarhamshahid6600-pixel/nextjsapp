
"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Landmark, Building, ShieldCheck, Palette, Sun, Moon, Monitor } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { updateAppSettingsInFirestore } from "@/lib/services/app-settings-service";
import type { AppSettings } from "@/lib/data-types";
import { availableCurrencies } from "@/app/settings/page";
import { initialAppSettings } from "@/lib/data";
import { useTheme } from "next-themes";


export function InitialSetupModal() {
  const {
    user,
    userId,
    appSettings,
    refreshAuthContext,
    showInitialSetupModal,
    setShowInitialSetupModal,
  } = useAuth();
  const { toast } = useToast();
  const { setTheme, theme: currentNextTheme } = useTheme();

  const [selectedCurrency, setSelectedCurrency] = useState<string>(appSettings.currency || initialAppSettings.currency);
  const [companyName, setCompanyName] = useState<string>(appSettings.companyDisplayName || initialAppSettings.companyDisplayName || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (showInitialSetupModal) {
        setSelectedCurrency(appSettings.currency || initialAppSettings.currency);
        setCompanyName(appSettings.companyDisplayName || initialAppSettings.companyDisplayName || "");
    }
  }, [appSettings, showInitialSetupModal]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!userId) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return;
    }
    if (!companyName.trim()) {
      toast({ title: "Error", description: "Company Display Name is required.", variant: "destructive" });
      return;
    }
    if (!selectedCurrency) {
      toast({ title: "Error", description: "Preferred Currency is required.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const settingsToUpdate: Partial<AppSettings> = {
        currency: selectedCurrency,
        companyDisplayName: companyName.trim(),
        hasCompletedInitialSetup: true,
      };
      
      await updateAppSettingsInFirestore(userId, appSettings, settingsToUpdate);
      
      toast({ title: "Setup Complete", description: "Your initial settings have been saved." });
      
      await refreshAuthContext(); 
      setShowInitialSetupModal(false);

    } catch (error: any) {
      toast({ title: "Error Saving Settings", description: error.message || "Could not save initial settings.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || !showInitialSetupModal || !user) {
    return null;
  }

  return (
    <Dialog 
        open={showInitialSetupModal} 
        onOpenChange={(open) => {
            if (!open && !appSettings.hasCompletedInitialSetup) {
                toast({title:"Setup Required", description: "Please complete the initial setup to continue.", variant:"default"});
                return; // Prevent closing
            }
            setShowInitialSetupModal(open);
        }}
    >
      <DialogContent 
        className="sm:max-w-lg" 
        data-hide-close-button={!appSettings.hasCompletedInitialSetup ? 'true' : 'false'}
        onPointerDownOutside={(e) => { if (!appSettings.hasCompletedInitialSetup) e.preventDefault(); }} 
        onEscapeKeyDown={(e) => { if (!appSettings.hasCompletedInitialSetup) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="font-headline text-xl flex items-center">
            <ShieldCheck className="mr-2 h-6 w-6 text-primary" />
            Welcome to {appSettings.companyDisplayName || initialAppSettings.companyDisplayName}! Let's Get Started
          </DialogTitle>
          <DialogDescription>
            Please provide some basic information to set up your account. This is required to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div>
            <Label htmlFor="companyName" className="flex items-center mb-1">
              <Building className="mr-2 h-4 w-4 text-muted-foreground" />Company Display Name
            </Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your Company's Name"
              required
              disabled={isSubmitting}
            />
          </div>
          
          <div>
            <Label htmlFor="currency" className="flex items-center mb-1">
              <Landmark className="mr-2 h-4 w-4 text-muted-foreground" />Preferred Currency
            </Label>
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency} disabled={isSubmitting}>
              <SelectTrigger id="currency">
                <SelectValue placeholder="Select your currency" />
              </SelectTrigger>
              <SelectContent>
                {availableCurrencies.map((curr) => (
                  <SelectItem key={curr.code} value={curr.code}>
                    {curr.name} ({curr.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="flex items-center mb-1">
              <Palette className="mr-2 h-4 w-4 text-muted-foreground" />Application Theme
            </Label>
            <div className="flex gap-2 flex-wrap mt-1">
              <Button 
                type="button" 
                variant={currentNextTheme === "light" ? "default" : "outline"} 
                onClick={() => setTheme("light")}
                disabled={isSubmitting}
              >
                <Sun className="mr-2 h-4 w-4" /> Light
              </Button>
              <Button 
                type="button" 
                variant={currentNextTheme === "dark" ? "default" : "outline"} 
                onClick={() => setTheme("dark")}
                disabled={isSubmitting}
              >
                <Moon className="mr-2 h-4 w-4" /> Dark
              </Button>
              <Button 
                type="button" 
                variant={currentNextTheme === "system" ? "default" : "outline"} 
                onClick={() => setTheme("system")}
                disabled={isSubmitting}
              >
                <Monitor className="mr-2 h-4 w-4" /> System
              </Button>
            </div>
          </div>


          <DialogFooter className="pt-4">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? "Saving..." : "Save & Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
