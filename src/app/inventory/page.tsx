

"use client";

import { useState, type FormEvent, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { PackagePlus, PackageMinus, PackageCheck, PackageSearch, Edit3, Trash2, Loader2, Info, ScanLine, Percent, FilterX, Check, ChevronsUpDown, PlusCircle, Tag, Save, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addProductForUser,
  updateProductStockForUser,
  updateProductDetailsForUser,
  deleteProductFromStorageForUser,
  getProductByIdForUser,
} from "@/lib/services/product-service";
import { updateAppSettingsInFirestore, getAppSettingsFromFirestore } from "@/lib/services/app-settings-service";
import type { Product, ActivityLogEntry, FinancialTransactionType, AppSettings } from "@/lib/data-types";
import { format } from 'date-fns';
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, coreAppData, refreshAuthContext } = useAuth();

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [productSalePrice, setProductSalePrice] = useState("");
  const [productCostPrice, setProductCostPrice] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productDiscount, setProductDiscount] = useState<string>("0");
  const [quantityChange, setQuantityChange] = useState<string>("0");
  const [action, setAction] = useState<"set" | "add" | "remove">("set");

  const [searchTerm, setSearchTerm] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all");

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const [isCreditCashConfirmOpen, setIsCreditCashConfirmOpen] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);


  const [isSubmittingInventoryForm, setIsSubmittingInventoryForm] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);

  const [isCategoryPopoverOpen, setIsCategoryPopoverOpen] = useState(false);
  const [categorySearchValue, setCategorySearchValue] = useState("");

  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryManagerSearchTerm, setCategoryManagerSearchTerm] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [editedCategoryValue, setEditedCategoryValue] = useState<string>("");
  const [newCategoryDialogInput, setNewCategoryDialogInput] = useState<string>("");
  const [isUpdatingCategories, setIsUpdatingCategories] = useState(false);

  const [isNegativeCashConfirmOpen, setIsNegativeCashConfirmOpen] = useState(false);
  const [negativeCashDetails, setNegativeCashDetails] = useState<{ currentCash: number; debitAmount: number; newBalance: number } | null>(null);
  const proceedActionRef = useRef<(() => Promise<void>) | null>(null);

  const filteredInventory = useMemo(() => {
    let items = [...coreAppData.products];

    if (appSettings) {
      if (stockStatusFilter === "outOfStock") {
        items = items.filter(item => item.stock === 0);
      } else if (stockStatusFilter === "lowStock") {
        items = items.filter(item => item.stock > 0 && item.stock < appSettings.lowStockThreshold);
      }
    }

    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(lowerSearchTerm) ||
        item.productCode.toLowerCase().includes(lowerSearchTerm) ||
        item.id.toLowerCase().includes(lowerSearchTerm) ||
        (item.category && item.category.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return items;
  }, [coreAppData.products, searchTerm, stockStatusFilter, appSettings]);

  const uniqueCategories = useMemo(() => {
    if (!appSettings || !appSettings.knownCategories) return [];
    return appSettings.knownCategories.sort((a,b) => a.localeCompare(b));
  }, [appSettings]);


  const resetForm = () => {
    setEditingProduct(null);
    setProductCode("");
    setProductName("");
    setProductSalePrice("");
    setProductCostPrice("");
    setProductCategory("");
    setProductDiscount("0");
    setQuantityChange("0");
    setAction("set");
    setCategorySearchValue("");
  };

  const proceedWithInventoryFormSubmission = async () => {
    setIsSubmittingInventoryForm(true);
    try {
      let successMessage = "";

      const finalCategory = productCategory.trim() || "Uncategorized";
      const numQuantityChange = parseInt(quantityChange, 10);
      const numSalePrice = parseFloat(productSalePrice);
      const numCostPrice = parseFloat(productCostPrice);
      const numDiscount = parseFloat(productDiscount);

      if (editingProduct && action === 'set') {
        await updateProductDetailsForUser(userId!, editingProduct.id, {
          name: productName.trim(),
          price: numSalePrice,
          costPrice: numCostPrice,
          category: finalCategory,
          discountPercentage: numDiscount,
        });
        successMessage = `Product ${productName.trim()} details updated.`;

        const oldStock = editingProduct.stock;
        const newStockLevel = numQuantityChange;
        
        if (newStockLevel !== oldStock) {
             await updateProductStockForUser(
              userId!, editingProduct.id, newStockLevel, "set", "set", numCostPrice
            );
            successMessage += ` Stock set to ${newStockLevel}.`;
        }

      } else if (action === "set" && !editingProduct) {
           await addProductForUser(userId!, {
            productCode: productCode.trim(),
            name: productName.trim(),
            price: numSalePrice,
            costPrice: numCostPrice,
            stock: numQuantityChange,
            category: finalCategory,
            supplier: '', 
            discountPercentage: numDiscount,
           });
           successMessage = `${productName.trim()} (Code: ${productCode.trim()}) added. Initial stock: ${numQuantityChange}.`;
           if (appSettings && numCostPrice > 0 && numQuantityChange > 0) {
                const financialImpact = numCostPrice * numQuantityChange;
                successMessage += ` Financial impact: ${formatCurrency(financialImpact, appSettings.currency, currencyForConversionSource)}.`;
           }
      } else {
        const targetProduct = editingProduct || coreAppData.products.find(p => p.name.toLowerCase() === productName.trim().toLowerCase() || p.productCode.toLowerCase() === productCode.trim().toLowerCase());
        if (!targetProduct) {
          toast({ title: "Product Not Found", description: `Product "${productName.trim() || productCode.trim()}" not found for stock adjustment. Select it from the list or add it first.`, variant: "destructive" });
          setIsSubmittingInventoryForm(false);
          proceedActionRef.current = null;
          return;
        }

        const productForCost = await getProductByIdForUser(userId!, targetProduct.id);
        const productCostPriceForTx = productForCost?.costPrice || 0;

        await updateProductStockForUser(userId!, targetProduct.id, numQuantityChange, action, "add/remove", productCostPriceForTx);
        successMessage = `Stock for ${targetProduct.name} (Code: ${targetProduct.productCode}) updated.`;
      }

      if (finalCategory !== "Uncategorized") {
        const freshAppSettingsForCategory = await getAppSettingsFromFirestore(userId!); 
        if (freshAppSettingsForCategory && !freshAppSettingsForCategory.knownCategories?.map(c => c.toLowerCase()).includes(finalCategory.toLowerCase())) {
            const updatedKnownCategories = [...(freshAppSettingsForCategory.knownCategories || []), finalCategory].sort((a, b) => a.localeCompare(b));
            await updateAppSettingsInFirestore(userId!, freshAppSettingsForCategory, { knownCategories: updatedKnownCategories });
        }
      }

      await refreshAuthContext(true); 
      toast({ title: "Success", description: successMessage });
      resetForm();

    } catch (error: any) {
      toast({ title: "Error Updating Inventory", description: error.message || "Failed to update inventory.", variant: "destructive" });
    } finally {
      setIsSubmittingInventoryForm(false);
      proceedActionRef.current = null;
    }
  };


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Authentication Error", description: "You must be logged in and app settings loaded to manage inventory.", variant: "destructive" });
      return;
    }

    const numQuantityChange = parseInt(quantityChange, 10);
    const numSalePrice = parseFloat(productSalePrice);
    const numCostPrice = parseFloat(productCostPrice);
    const numDiscount = parseFloat(productDiscount);

    if (action === 'set' && !editingProduct && !productCode.trim()) {
      toast({ title: "Product Code Required", description: "Product Code is required for new products.", variant: "destructive" });
      return;
    }
    if (!productName.trim() && (action === 'set' && !editingProduct)) {
         toast({ title: "Product Name Required", description: "Product name is required for new products.", variant: "destructive" });
        return;
    }
     if (action === 'set' && (isNaN(numSalePrice) || numSalePrice <=0)) {
        toast({ title: "Invalid Sale Price", description: "Valid sale price is required for new or set actions.", variant: "destructive" });
        return;
    }
    if (action === 'set' && (isNaN(numCostPrice) || numCostPrice < 0)) {
        toast({ title: "Invalid Cost Price", description: "Valid cost price (0 or more) is required for new or set actions.", variant: "destructive" });
        return;
    }
    if (numCostPrice > numSalePrice && action === 'set') {
        toast({ title: "Pricing Warning", description: "Cost price is higher than sale price. This will result in a loss per item.", variant: "default" });
    }
    if (action === 'set' && (isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100)) {
      toast({ title: "Invalid Discount", description: "Discount must be a number between 0 and 100.", variant: "destructive" });
      return;
    }

    let quantityIsValid = true;
    let invalidQuantityMessage = "Please enter a valid quantity for the selected action.";

    if (quantityChange.trim() === "" || isNaN(numQuantityChange)) {
      quantityIsValid = false;
    } else {
      if (action === 'set') {
        if (!editingProduct) { 
          if (numQuantityChange <= 0) { 
            quantityIsValid = false;
            invalidQuantityMessage = "Initial stock quantity for a new product must be greater than 0.";
          }
        } else { 
          if (numQuantityChange < 0) {
             quantityIsValid = false;
             invalidQuantityMessage = "Stock level cannot be negative.";
          }
        }
      } else if (action === 'add') { 
        if (numQuantityChange <= 0) {
            quantityIsValid = false;
            invalidQuantityMessage = "Quantity to add must be greater than 0.";
        }
      } else if (action === 'remove') { 
        if (numQuantityChange <= 0) {
            quantityIsValid = false;
            invalidQuantityMessage = "Quantity to remove must be greater than 0.";
        }
      }
    }

    if (!quantityIsValid) {
      toast({ title: "Invalid Quantity", description: invalidQuantityMessage, variant: "destructive" });
      return;
    }

    // --- Negative Cash Balance Check ---
    let debitAmount = 0;
    if (action === 'set' && !editingProduct && numCostPrice > 0 && numQuantityChange > 0) { // Adding new product
        debitAmount = numCostPrice * numQuantityChange;
    } else if (action === 'set' && editingProduct && numQuantityChange > editingProduct.stock && numCostPrice > 0) { // Increasing stock via "set"
        debitAmount = numCostPrice * (numQuantityChange - editingProduct.stock);
    } else if (action === 'add' && editingProduct && numCostPrice > 0 && numQuantityChange > 0) { // Adding stock via "add"
        debitAmount = numCostPrice * numQuantityChange;
    }
    
    if (debitAmount > 0) {
        const currentCash = appSettings.currentBusinessCash;
        const potentialNewCash = currentCash - debitAmount;
        if (potentialNewCash < 0) {
            setNegativeCashDetails({ currentCash, debitAmount, newBalance: potentialNewCash });
            proceedActionRef.current = proceedWithInventoryFormSubmission;
            setIsNegativeCashConfirmOpen(true);
            return;
        }
    }
    
    await proceedWithInventoryFormSubmission();
  };

  const handleProductSelectForUpdate = (selectedProduct: Product) => {
    setEditingProduct(selectedProduct);
    setProductCode(selectedProduct.productCode);
    setProductName(selectedProduct.name);
    setProductSalePrice(selectedProduct.price.toString());
    setProductCostPrice((selectedProduct.costPrice || 0).toString());
    setProductCategory(selectedProduct.category || "");
    setProductDiscount((selectedProduct.discountPercentage || 0).toString());
    setQuantityChange(selectedProduct.stock.toString());
    setAction("set");
    setCategorySearchValue("");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDeleteConfirm = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteConfirmOpen(true);
  };
  
  const handleFinalDeletion = async (creditCash: boolean) => {
    if (!productToDelete || !userId || !appSettings) return;

    if (dontAskAgain && appSettings?.promptCreditOnDelete !== false) {
      await handleSaveSettings({ promptCreditOnDelete: false });
    }

    setIsDeletingProduct(true);
    try {
        await deleteProductFromStorageForUser(userId, productToDelete.id, creditCash);
        toast({ title: "Product Deleted", description: `${productToDelete.name} has been removed from inventory.` });
        
        // This is a temporary immediate state update for better UX.
        // A full refresh will still happen in the background.
        coreAppData.products = coreAppData.products.filter(p => p.id !== productToDelete.id);
        
        if (editingProduct?.id === productToDelete.id) {
            resetForm();
        }
    } catch (error: any) {
        toast({ title: "Error Deleting Product", description: error.message || "Failed to remove product.", variant: "destructive" });
    } finally {
        setIsDeletingProduct(false);
        setProductToDelete(null);
        setIsCreditCashConfirmOpen(false);
        setDontAskAgain(false);
        // Trigger a full refresh in the background to ensure consistency
        refreshAuthContext(true);
    }
  };


  const confirmDelete = async () => {
    if (!productToDelete || !userId || !appSettings) return;

    setIsDeleteConfirmOpen(false); // Close the initial confirmation dialog

    const hasValue = productToDelete.stock > 0 && (productToDelete.costPrice || 0) > 0;
    const shouldPrompt = appSettings.promptCreditOnDelete !== false;

    if (hasValue && shouldPrompt) {
        // If the item has value and we should prompt, open the cash credit dialog.
        setIsCreditCashConfirmOpen(true);
    } else {
        // Otherwise, proceed with deletion without crediting cash.
        await handleFinalDeletion(false);
    }
  };

  const formatLastUpdatedTimestamp = (isoTimestamp: string) => {
    try {
      return format(new Date(isoTimestamp), "PPp");
    } catch (e) {
      return "N/A";
    }
  };

  const getStockColor = (stock: number) => {
    if (!appSettings) return 'text-foreground';
    const threshold = appSettings.lowStockThreshold;
    const criticalThreshold = Math.max(1, Math.floor(threshold / 2));
    if (stock <= 0) return 'text-destructive font-bold';
    if (stock < criticalThreshold) return 'text-destructive';
    if (stock < threshold) return 'text-orange-500 dark:text-orange-400';
    return 'text-foreground';
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStockStatusFilter("all");
  };

  const hasActiveFilters = searchTerm.trim() !== "" || stockStatusFilter !== "all";

  const getMinQuantityForInput = () => {
    if (action === 'set' && !editingProduct) return "1"; 
    if (action === 'set' && editingProduct) return "0"; 
    return "1"; 
  };

  const dialogFilteredCategories = useMemo(() => {
    if (!appSettings?.knownCategories) return [];
    const lowerSearch = categoryManagerSearchTerm.toLowerCase();
    return appSettings.knownCategories.filter(cat => cat.toLowerCase().includes(lowerSearch)).sort();
  }, [appSettings?.knownCategories, categoryManagerSearchTerm]);

  const handleOpenCategoryManager = () => {
    setNewCategoryDialogInput("");
    setEditingCategoryName(null);
    setEditedCategoryValue("");
    setCategoryManagerSearchTerm("");
    setIsCategoryManagerOpen(true);
  };
  
    const handleSaveSettings = async (settingsToUpdate: Partial<AppSettings>) => {
     if (!userId || !appSettings) return;
     try {
       await updateAppSettingsInFirestore(userId, appSettings, settingsToUpdate);
       await refreshAuthContext(); // Refresh context to get latest settings
     } catch (error) {
       console.error("Failed to save 'don't ask again' setting:", error);
     }
   };

  const handleAddNewCategoryFromDialog = async () => {
    if (!userId || !appSettings) return;
    const categoryToAdd = newCategoryDialogInput.trim();
    if (!categoryToAdd) {
      toast({ title: "Category Name Required", description: "Please enter a name for the new category.", variant: "destructive" });
      return;
    }
    if ((appSettings.knownCategories || []).map(c => c.toLowerCase()).includes(categoryToAdd.toLowerCase())) {
      toast({ title: "Category Exists", description: `Category "${categoryToAdd}" already exists.`, variant: "default" });
      setNewCategoryDialogInput("");
      return;
    }
    setIsUpdatingCategories(true);
    const updatedCategories = [...(appSettings.knownCategories || []), categoryToAdd].sort((a, b) => a.localeCompare(b));
    try {
      await updateAppSettingsInFirestore(userId, appSettings, { knownCategories: updatedCategories });
      toast({ title: "Category Added", description: `"${categoryToAdd}" has been added.`});
      setNewCategoryDialogInput("");
      await refreshAuthContext();
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to add category: ${error.message}`, variant: "destructive"});
    } finally {
      setIsUpdatingCategories(false);
    }
  };

  const handleDeleteCategoryFromDialog = async (categoryToDelete: string) => {
    if (!userId || !appSettings) return;
    setIsUpdatingCategories(true);
    const updatedCategories = (appSettings.knownCategories || []).filter(cat => cat !== categoryToDelete);
    try {
      await updateAppSettingsInFirestore(userId, appSettings, { knownCategories: updatedCategories });
      toast({ title: "Category Deleted", description: `"${categoryToDelete}" has been removed.`});
      if (editingCategoryName === categoryToDelete) {
          setEditingCategoryName(null);
          setEditedCategoryValue("");
      }
      await refreshAuthContext();
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to delete category: ${error.message}`, variant: "destructive"});
    } finally {
      setIsUpdatingCategories(false);
    }
  };

  const handleStartEditCategoryDialog = (categoryToEdit: string) => {
    setEditingCategoryName(categoryToEdit);
    setEditedCategoryValue(categoryToEdit);
    setNewCategoryDialogInput(""); 
  };

  const handleSaveEditedCategoryDialog = async () => {
    if (!userId || !appSettings || !editingCategoryName) return;
    const newName = editedCategoryValue.trim();
    if (!newName) {
      toast({ title: "Category Name Required", description: "Category name cannot be empty.", variant: "destructive" });
      return;
    }
    if (newName.toLowerCase() !== editingCategoryName.toLowerCase() && (appSettings.knownCategories || []).map(c => c.toLowerCase()).includes(newName.toLowerCase())) {
      toast({ title: "Category Exists", description: `Another category named "${newName}" already exists.`, variant: "destructive" });
      return;
    }
    setIsUpdatingCategories(true);
    const updatedCategories = (appSettings.knownCategories || [])
        .map(cat => (cat === editingCategoryName ? newName : cat))
        .sort((a, b) => a.localeCompare(b));
    try {
      await updateAppSettingsInFirestore(userId, appSettings, { knownCategories: updatedCategories });
      toast({ title: "Category Updated", description: `"${editingCategoryName}" has been updated to "${newName}".`});
      setEditingCategoryName(null);
      setEditedCategoryValue("");
      await refreshAuthContext();
    } catch (error: any) {
       toast({ title: "Error", description: `Failed to update category: ${error.message}`, variant: "destructive"});
    } finally {
        setIsUpdatingCategories(false);
    }
  };


  if (authLoading || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading inventory data...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to manage inventory.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <AlertDialog open={isNegativeCashConfirmOpen} onOpenChange={(open) => {
        if (!open) proceedActionRef.current = null;
        setIsNegativeCashConfirmOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Cash Balance Warning</AlertDialogTitle>
            <AlertDialogDescription>
              This inventory operation will result in a negative total business cash balance.
              <ul className="mt-2 list-disc list-inside text-sm">
                <li>Current Cash: {formatCurrency(negativeCashDetails?.currentCash || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li>Inventory Cost: {formatCurrency(negativeCashDetails?.debitAmount || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li className="font-semibold">Potential New Balance: {formatCurrency(negativeCashDetails?.newBalance || 0, appSettings.currency, currencyForConversionSource)}</li>
              </ul>
              Do you want to proceed with this inventory update?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => proceedActionRef.current = null} disabled={isSubmittingInventoryForm}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (proceedActionRef.current) {
                  await proceedActionRef.current();
                }
              }}
              disabled={isSubmittingInventoryForm}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmittingInventoryForm ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {productToDelete?.name} (Code: {productToDelete?.productCode}) from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingProduct}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90" disabled={isDeletingProduct}>
              {isDeletingProduct ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
       <AlertDialog open={isCreditCashConfirmOpen} onOpenChange={setIsCreditCashConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Credit Business Cash?</AlertDialogTitle>
            <AlertDialogDescription>
              The deleted product has a remaining stock value of{' '}
              <strong className="text-foreground">
                {formatCurrency((productToDelete?.stock || 0) * (productToDelete?.costPrice || 0), appSettings.currency, currencyForConversionSource)}
              </strong>
              . Would you like to credit this amount back to your "Total Business Cash"?
            </AlertDialogDescription>
             <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="dont-ask-again" checked={dontAskAgain} onCheckedChange={(checked) => setDontAskAgain(checked as boolean)} />
                <Label htmlFor="dont-ask-again" className="text-sm font-normal text-muted-foreground">Do not ask me again (you can change this in Settings)</Label>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => handleFinalDeletion(false)} disabled={isDeletingProduct}>
              No, Just Delete
            </Button>
            <Button onClick={() => handleFinalDeletion(true)} disabled={isDeletingProduct} className="bg-green-600 hover:bg-green-700">
              {isDeletingProduct ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Yes, Credit Cash
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={isCategoryManagerOpen} onOpenChange={setIsCategoryManagerOpen}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle className="flex items-center"><Tag className="mr-2 h-5 w-5 text-primary"/>Manage Product Categories</DialogTitle>
                <DialogDescription>Add, edit, or delete product categories.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                {editingCategoryName ? (
                    <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                        <Label htmlFor="editCategoryValueInput" className="font-semibold">Editing: {editingCategoryName}</Label>
                        <Input
                            id="editCategoryValueInput"
                            value={editedCategoryValue}
                            onChange={(e) => setEditedCategoryValue(e.target.value)}
                            placeholder="New category name"
                            disabled={isUpdatingCategories}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditedCategoryDialog();}}}
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setEditingCategoryName(null)} disabled={isUpdatingCategories}>Cancel</Button>
                            <Button size="sm" onClick={handleSaveEditedCategoryDialog} disabled={isUpdatingCategories || !editedCategoryValue.trim() || editedCategoryValue.trim() === editingCategoryName}>
                                {isUpdatingCategories ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Save Edit
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                        <Label htmlFor="newCategoryDialogInput" className="font-semibold">Add New Category</Label>
                        <Input
                            id="newCategoryDialogInput"
                            value={newCategoryDialogInput}
                            onChange={(e) => setNewCategoryDialogInput(e.target.value)}
                            placeholder="Enter new category name"
                            disabled={isUpdatingCategories || !!editingCategoryName}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewCategoryFromDialog();}}}
                        />
                         <Button onClick={handleAddNewCategoryFromDialog} disabled={isUpdatingCategories || !!editingCategoryName || !newCategoryDialogInput.trim()} className="w-full" size="sm">
                            {isUpdatingCategories ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                            Add Category
                        </Button>
                    </div>
                )}

                <Separator />

                <div className="space-y-2">
                    <Label htmlFor="categoryManagerSearch">Search Categories</Label>
                    <Input
                        id="categoryManagerSearch"
                        value={categoryManagerSearchTerm}
                        onChange={(e) => setCategoryManagerSearchTerm(e.target.value)}
                        placeholder="Type to search..."
                        disabled={!!editingCategoryName}
                    />
                </div>
                
                <ScrollArea className="h-[250px] border rounded-md p-2">
                    {dialogFilteredCategories.length > 0 ? (
                        dialogFilteredCategories.map(cat => (
                            <div key={cat} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-sm text-sm">
                                <span>{cat}</span>
                                <div className="space-x-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEditCategoryDialog(cat)} title={`Edit ${cat}`} disabled={isUpdatingCategories || !!editingCategoryName}>
                                        <Edit3 className="h-4 w-4"/>
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteCategoryFromDialog(cat)} title={`Delete ${cat}`} disabled={isUpdatingCategories || !!editingCategoryName}>
                                        <Trash2 className="h-4 w-4"/>
                                    </Button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-muted-foreground text-center p-4">
                            {appSettings?.knownCategories?.length === 0 ? "No categories yet. Add one above." : "No categories match your search."}
                        </p>
                    )}
                </ScrollArea>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsCategoryManagerOpen(false)} disabled={isUpdatingCategories}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl">{editingProduct ? "Edit Product" : "Manage Stock / Add Product"}</CardTitle>
            <CardDescription>{editingProduct ? `Editing ${editingProduct.name} (Code: ${editingProduct.productCode})` : "Add new products or update stock levels."}</CardDescription>
            {editingProduct && <Button variant="link" size="sm" className="p-0 h-auto" onClick={resetForm} disabled={isSubmittingInventoryForm}>Clear selection / Add new</Button>}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="action">Action</Label>
                <Select
                  value={action}
                  onValueChange={(value: "set" | "add" | "remove") => {
                    setAction(value);
                    if((value === 'add' || value === 'remove')) {
                      setQuantityChange("1");
                      if (!editingProduct && !productName && !productCode) {
                        toast({title: "Select Product", description: "Select a product from the list to add/remove stock, or type its name/code.", variant: "default"});
                      }
                    } else if (editingProduct) {
                      setQuantityChange(editingProduct.stock.toString());
                    } else {
                      setQuantityChange(getMinQuantityForInput()); 
                    }
                  }}
                  disabled={isSubmittingInventoryForm}
                >
                  <SelectTrigger id="action" className="mt-1">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">{editingProduct ? "Update Product Details & Stock" : "Add New Product / Set Initial Stock"}</SelectItem>
                    <SelectItem value="add">Add to Stock</SelectItem>
                    <SelectItem value="remove">Remove from Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

               {editingProduct && action === 'set' && (
                 <div>
                    <Label htmlFor="productIdDisplay">Product ID</Label>
                    <Input id="productIdDisplay" value={editingProduct.id} disabled className="mt-1 bg-muted/50"/>
                 </div>
               )}

              <div>
                <Label htmlFor="productCode" className="flex items-center"><ScanLine className="mr-2 h-4 w-4 text-muted-foreground" />Product Code</Label>
                <Input
                  id="productCode"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                  placeholder="e.g., SKU123"
                  required={action === 'set' && !editingProduct}
                  className="mt-1"
                  disabled={isSubmittingInventoryForm || (!!editingProduct && action === 'set')}
                />
              </div>

              <div>
                <Label htmlFor="productName">Product Name</Label>
                <Input id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g., Vitamin D3" required={action === 'set' || !!editingProduct} className="mt-1" disabled={isSubmittingInventoryForm}/>
              </div>

              {(action === 'set') && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <Label htmlFor="productCostPrice">Cost Price</Label>
                        <Input id="productCostPrice" type="number" value={productCostPrice} onChange={(e) => setProductCostPrice(e.target.value)} placeholder="e.g., 10.50" step="0.01" min="0" required className="mt-1" disabled={isSubmittingInventoryForm}/>
                    </div>
                    <div>
                        <Label htmlFor="productSalePrice">Sale Price</Label>
                        <Input id="productSalePrice" type="number" value={productSalePrice} onChange={(e) => setProductSalePrice(e.target.value)} placeholder="e.g., 15.99" step="0.01" min="0.01" required className="mt-1" disabled={isSubmittingInventoryForm}/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="productCategory">Category</Label>
                       <Popover open={isCategoryPopoverOpen} onOpenChange={setIsCategoryPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isCategoryPopoverOpen}
                            className="w-full justify-between mt-1"
                            disabled={isSubmittingInventoryForm}
                          >
                            {productCategory || "Select category..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                          <Command shouldFilter={false} onKeyDown={(e) => {
                              if (e.key === 'Escape') setIsCategoryPopoverOpen(false);
                          }}>
                            <CommandInput
                              placeholder="Search or create category..."
                              value={categorySearchValue}
                              onValueChange={setCategorySearchValue}
                            />
                            <CommandEmpty>
                              {categorySearchValue.trim() !== "" ? (
                                <CommandItem
                                  onSelect={() => {
                                    setProductCategory(categorySearchValue.trim());
                                    setIsCategoryPopoverOpen(false);
                                    setCategorySearchValue("");
                                  }}
                                  className="cursor-pointer"
                                >
                                  <PlusCircle className="mr-2 h-4 w-4 text-primary"/>
                                  Create &quot;{categorySearchValue.trim()}&quot;
                                </CommandItem>
                              ) : "No category found."}
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandList>
                                {uniqueCategories
                                .filter(cat => cat.toLowerCase().includes(categorySearchValue.toLowerCase()))
                                .map((category) => (
                                  <CommandItem
                                    key={category}
                                    value={category}
                                    onSelect={(currentValue) => {
                                      setProductCategory(currentValue === productCategory ? "" : currentValue);
                                      setIsCategoryPopoverOpen(false);
                                      setCategorySearchValue("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        productCategory === category ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {category}
                                  </CommandItem>
                                ))}
                                {categorySearchValue.trim() !== "" && !uniqueCategories.map(c=>c.toLowerCase()).includes(categorySearchValue.toLowerCase().trim()) && (
                                   <CommandItem
                                      onSelect={() => {
                                        setProductCategory(categorySearchValue.trim());
                                        setIsCategoryPopoverOpen(false);
                                        setCategorySearchValue("");
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <PlusCircle className="mr-2 h-4 w-4 text-primary"/>
                                      Create &quot;{categorySearchValue.trim()}&quot;
                                    </CommandItem>
                                )}
                              </CommandList>
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label htmlFor="productDiscount" className="flex items-center"><Percent className="mr-1 h-4 w-4 text-muted-foreground" />Discount</Label>
                      <Input id="productDiscount" type="number" value={productDiscount} onChange={(e) => setProductDiscount(e.target.value)} placeholder="e.g., 10" step="1" min="0" max="100" className="mt-1" disabled={isSubmittingInventoryForm}/>
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="quantityChange">{action === 'add' ? 'Quantity to Add' : action === 'remove' ? 'Quantity to Remove' : (editingProduct ? 'Set New Stock Level' : 'Initial Stock Quantity')}</Label>
                <Input id="quantityChange" type="number" value={quantityChange} onChange={(e) => setQuantityChange(e.target.value)} min={getMinQuantityForInput()} required className="mt-1" disabled={isSubmittingInventoryForm}/>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmittingInventoryForm || isDeletingProduct}>
                {isSubmittingInventoryForm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                  (action === "set" ? <PackageCheck className="mr-2 h-4 w-4" /> : action === "add" ? <PackagePlus className="mr-2 h-4 w-4" /> : <PackageMinus className="mr-2 h-4 w-4" />)
                }
                {isSubmittingInventoryForm ? "Processing..." :
                  (action === "set" ? (editingProduct ? "Save Changes" : "Add Product") : action === "add" ? "Add Stock" : "Remove Stock")
                }
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center"><PackageSearch className="mr-2 h-5 w-5 text-primary"/> Current Inventory</CardTitle>
            <div className="mt-2 space-y-2 md:space-y-0 md:flex md:items-end md:gap-2">
                <div className="flex-grow">
                    <Label htmlFor="inventorySearch" className="sr-only">Search Inventory</Label>
                    <Input
                        id="inventorySearch"
                        placeholder="Search by Name, Code, or Category..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                        disabled={isSubmittingInventoryForm || isDeletingProduct}
                    />
                </div>
                <div className="md:w-auto">
                     <Label htmlFor="stockStatusFilter" className="sr-only">Filter by Stock Status</Label>
                    <Select value={stockStatusFilter} onValueChange={setStockStatusFilter} disabled={isSubmittingInventoryForm || isDeletingProduct}>
                        <SelectTrigger id="stockStatusFilter" className="w-full md:w-[180px]">
                            <SelectValue placeholder="Filter by stock status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Products</SelectItem>
                            <SelectItem value="outOfStock">Out of Stock</SelectItem>
                            <SelectItem value="lowStock">Low Stock</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" size="sm" onClick={handleOpenCategoryManager} className="md:self-end h-10" title="Manage Categories" disabled={isSubmittingInventoryForm || isDeletingProduct || isUpdatingCategories}>
                    <Tag className="mr-2 h-4 w-4" /> Manage Categories
                </Button>
                 {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={handleClearFilters} className="md:self-end h-10" disabled={isSubmittingInventoryForm || isDeletingProduct}>
                        <FilterX className="mr-2 h-4 w-4" /> Clear Filters
                    </Button>
                )}
            </div>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[100px] text-right">Cost</TableHead>
                  <TableHead className="w-[100px] text-right">Sale</TableHead>
                  <TableHead className="w-[80px] text-right">Disc. %</TableHead>
                  <TableHead className="text-right w-[80px]">Stock</TableHead>
                  <TableHead className="w-[160px]">Last Updated</TableHead>
                  <TableHead className="w-[110px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.length > 0 ? filteredInventory.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-mono text-xs">{item.productCode}</TableCell>
                    <TableCell>
                      {item.name}
                      {item.category && <p className="text-xs text-muted-foreground">{item.category}</p>}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.costPrice || 0, appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.price, appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell className="text-right">{item.discountPercentage || 0}%</TableCell>
                    <TableCell className={`text-right font-semibold ${getStockColor(item.stock)}`}>{item.stock}</TableCell>
                    <TableCell className="text-xs">{formatLastUpdatedTimestamp(item.lastUpdated)}</TableCell>
                    <TableCell className="text-center space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => handleProductSelectForUpdate(item)} className="h-8 w-8" disabled={isSubmittingInventoryForm || isDeletingProduct}>
                        <Edit3 className="h-4 w-4" />
                         <span className="sr-only">Edit</span>
                      </Button>
                       <Button variant="ghost" size="icon" onClick={() => handleOpenDeleteConfirm(item)} className="h-8 w-8 text-destructive hover:text-destructive-foreground hover:bg-destructive" disabled={isSubmittingInventoryForm || isDeletingProduct}>
                        <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                      {coreAppData.products.length === 0 ? "No products in inventory. Add your first product!" : "No products match your current filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
