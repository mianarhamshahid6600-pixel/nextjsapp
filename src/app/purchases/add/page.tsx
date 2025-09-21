
"use client";

import { useState, type FormEvent, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CalendarIcon, PlusCircle, Trash2, Save, Loader2, PackageSearch, UserCircle, FileText, Receipt, ListChecks, ScanLine, DollarSign, Edit, Sparkles, Info, Edit2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from 'date-fns';
import { getSuppliersForUser } from "@/lib/services/supplier-service";
import { getProductsForUser } from "@/lib/services/product-service";
import { addPurchaseInvoiceForUser, getPurchaseInvoiceByIdForUser, updatePurchaseInvoiceForUser } from "@/lib/services/purchase-service";
import type { Product, Supplier, PurchaseInvoice, PurchaseItem } from "@/lib/data-types";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductSelectionDialog } from "@/components/shared/product-selection-dialog";
import { cn } from "@/lib/utils";


interface PurchaseFormItem extends PurchaseItem {
  clientTempId: string; 
}

export default function RecordPurchasePage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, refreshAuthContext } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [originalInvoiceData, setOriginalInvoiceData] = useState<PurchaseInvoice | null>(null);


  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(new Date());
  const [items, setItems] = useState<PurchaseFormItem[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [taxAmount, setTaxAmount] = useState<string>("0");
  const [amountPaid, setAmountPaid] = useState<string>("0");

  const [currentProductCodeInput, setCurrentProductCodeInput] = useState<string>("");
  const [currentSelectedProduct, setCurrentSelectedProduct] = useState<Product | null>(null);
  const [currentProductId, setCurrentProductId] = useState<string>("");
  const [currentQuantity, setCurrentQuantity] = useState<string>("1");
  const [currentPurchasePrice, setCurrentPurchasePrice] = useState<string>("");
  const [currentItemNewSalePrice, setCurrentItemNewSalePrice] = useState<string>(""); 
  
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);

  const [codeSuggestions, setCodeSuggestions] = useState<Product[]>([]);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);

  const productCodeInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const purchasePriceInputRef = useRef<HTMLInputElement>(null);
  const salePriceInputRef = useRef<HTMLInputElement>(null); 

  const [manualItemNameInput, setManualItemNameInput] = useState<string>("");
  const [manualItemCodeInput, setManualItemCodeInput] = useState<string>("");
  const [manualItemQuantityInput, setManualItemQuantityInput] = useState<string>("1");
  const [manualItemCostPriceInput, setManualItemCostPriceInput] = useState<string>("");
  const [manualItemSalePriceInput, setManualItemSalePriceInput] = useState<string>("");

  const manualItemNameRef = useRef<HTMLInputElement>(null);
  const manualItemCodeRef = useRef<HTMLInputElement>(null);
  const manualItemQuantityRef = useRef<HTMLInputElement>(null);
  const manualItemCostRef = useRef<HTMLInputElement>(null);
  const manualItemSaleRef = useRef<HTMLInputElement>(null);

  const [isNegativeCashConfirmOpen, setIsNegativeCashConfirmOpen] = useState(false);
  const [negativeCashDetails, setNegativeCashDetails] = useState<{ currentCash: number; debitAmount: number; newBalance: number } | null>(null);
  const proceedActionRef = useRef<(() => Promise<void>) | null>(null);


  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
        setIsEditMode(true);
        setEditingInvoiceId(editId);
    } else {
        const prefillSupplierId = searchParams.get('supplierId');
        if (prefillSupplierId) {
            setSelectedSupplierId(prefillSupplierId);
        }
    }
  }, [searchParams]);


  const fetchData = useCallback(async () => {
    if (!userId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      const [loadedSuppliers, loadedProducts] = await Promise.all([
        getSuppliersForUser(userId),
        getProductsForUser(userId),
      ]);
      setSuppliers(loadedSuppliers);
      setProducts(loadedProducts);

      if (editingInvoiceId) {
          const invoice = await getPurchaseInvoiceByIdForUser(userId, editingInvoiceId);
          if (invoice) {
              setOriginalInvoiceData(invoice);
              setSelectedSupplierId(invoice.supplierId);
              setInvoiceNumber(invoice.invoiceNumber);
              setInvoiceDate(new Date(invoice.invoiceDate));
              setItems(invoice.items.map(item => ({...item, clientTempId: item.productId || `manual_${Date.now()}_${Math.random()}`})));
              setTaxAmount(String(invoice.taxAmount || '0'));
              setAmountPaid(String(invoice.amountPaid));
              setNotes(invoice.notes || '');
          } else {
              toast({ title: "Error", description: "Could not find the purchase invoice to edit.", variant: "destructive" });
              router.push('/purchases/list');
          }
      }

    } catch (error) {
      console.error("Failed to load data for purchase page:", error);
      toast({ title: "Error Loading Data", description: "Could not load suppliers, products, or invoice for editing.", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, toast, editingInvoiceId, router]);

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
    }
  }, [authLoading, userId, appSettings, fetchData]);

  useEffect(() => {
    const code = currentProductCodeInput.trim();
    if (code === "") {
      setCodeSuggestions([]);
      setShowCodeSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      if (!currentSelectedProduct) { 
          setCurrentProductId("");
          setCurrentPurchasePrice("");
          setCurrentItemNewSalePrice("");
      }
      return;
    }

    const lowerCaseInput = code.toLowerCase();
    const filtered = products.filter(p =>
      p.productCode.toLowerCase().includes(lowerCaseInput) ||
      p.name.toLowerCase().includes(lowerCaseInput)
    );
    setCodeSuggestions(filtered.slice(0, 7)); 
    setHighlightedSuggestionIndex(filtered.length > 0 ? 0 : -1);

    if (filtered.length > 0 && document.activeElement === productCodeInputRef.current) {
        setShowCodeSuggestions(true);
    } else if (filtered.length === 0) {
        setShowCodeSuggestions(false);
    }
  }, [currentProductCodeInput, products, currentSelectedProduct]);


  const handleSuggestionClick = (product: Product) => {
    setCurrentSelectedProduct(product);
    setCurrentProductId(product.id);
    setCurrentProductCodeInput(product.name); 
    setCurrentPurchasePrice((product.costPrice || 0).toString());
    setCurrentItemNewSalePrice(product.price.toString()); 
    
    setShowCodeSuggestions(false);
    setCodeSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    quantityInputRef.current?.focus();
    quantityInputRef.current?.select();
  };

  const handleProductCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCodeSuggestions && codeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => (prev + 1) % codeSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => (prev - 1 + codeSuggestions.length) % codeSuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < codeSuggestions.length) {
          handleSuggestionClick(codeSuggestions[highlightedSuggestionIndex]);
        } else if (codeSuggestions.length === 1 && currentProductCodeInput.trim().toUpperCase() === codeSuggestions[0].productCode.toUpperCase()) {
           handleSuggestionClick(codeSuggestions[0]);
        } else {
           quantityInputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        setShowCodeSuggestions(false);
        setHighlightedSuggestionIndex(-1);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const exactMatch = products.find(p => p.productCode.toUpperCase() === currentProductCodeInput.trim().toUpperCase());
      if (exactMatch) {
          handleSuggestionClick(exactMatch);
      } else {
         quantityInputRef.current?.focus();
      }
    }
  };
  
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      purchasePriceInputRef.current?.focus();
    }
  };

  const handlePurchasePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      salePriceInputRef.current?.focus(); 
    }
  };

  const handleSalePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem(); 
    }
  };

  const handleManualItemNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); manualItemCodeRef.current?.focus(); }};
  const handleManualItemCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); manualItemQuantityRef.current?.focus(); }};
  const handleManualItemQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); manualItemCostRef.current?.focus(); }};
  const handleManualItemCostKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); manualItemSaleRef.current?.focus(); }};
  const handleManualItemSaleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewItemToReceipt(); }};


  const subTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.itemTotal, 0);
  }, [items]);

  const grandTotal = useMemo(() => {
    const numTax = parseFloat(taxAmount) || 0;
    return subTotal + numTax;
  }, [subTotal, taxAmount]);

  const paymentStatus = useMemo(() => {
    const numAmountPaid = parseFloat(amountPaid) || 0;
    if (grandTotal <= 0 && numAmountPaid === 0) return "unpaid"; 
    if (numAmountPaid >= grandTotal && grandTotal > 0) return "paid";
    if (numAmountPaid > 0 && numAmountPaid < grandTotal) return "partially_paid";
    return "unpaid";
  }, [grandTotal, amountPaid]);

  const resetItemEntryFields = () => {
    setCurrentProductCodeInput("");
    setCurrentSelectedProduct(null);
    setCurrentProductId("");
    setCurrentQuantity("1");
    setCurrentPurchasePrice("");
    setCurrentItemNewSalePrice("");
    setShowCodeSuggestions(false);
    setCodeSuggestions([]);
    setHighlightedSuggestionIndex(-1);
  }

  const handleAddItem = () => {
    if (!currentSelectedProduct || !currentProductId) {
      toast({ title: "Product Not Selected", description: "Please select a valid product from suggestions or search.", variant: "destructive" });
      return;
    }
    const product = currentSelectedProduct;
    const quantity = parseInt(currentQuantity, 10);
    const purchasePrice = parseFloat(currentPurchasePrice);
    const newSalePrice = parseFloat(currentItemNewSalePrice); 

    if (isNaN(quantity) || quantity <= 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid quantity.", variant: "destructive" });
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
      return;
    }
    if (isNaN(purchasePrice) || purchasePrice <= 0) {
      toast({ title: "Invalid Purchase Price", description: "Please enter a valid purchase price.", variant: "destructive" });
      purchasePriceInputRef.current?.focus();
      purchasePriceInputRef.current?.select();
      return;
    }
    if (isNaN(newSalePrice) || newSalePrice <= 0) { 
      toast({ title: "Invalid Sale Price", description: "Please enter a valid sale price for the item.", variant: "destructive" });
      salePriceInputRef.current?.focus();
      salePriceInputRef.current?.select();
      return;
    }

    const newItem: PurchaseFormItem = {
      clientTempId: Date.now().toString(), 
      productId: product.id,
      productCode: product.productCode, 
      productName: product.name,
      quantity,
      purchasePrice,
      itemTotal: quantity * purchasePrice,
    };
    setItems(prev => [...prev, newItem]);
    resetItemEntryFields();
    toast({ title: "Item Added", description: `${product.name} added to receipt.` });
    productCodeInputRef.current?.focus();
  };

  const handleAddNewItemToReceipt = () => {
    const name = manualItemNameInput.trim();
    const code = manualItemCodeInput.trim();
    const quantity = parseInt(manualItemQuantityInput, 10);
    const costPrice = parseFloat(manualItemCostPriceInput);
    const salePrice = parseFloat(manualItemSalePriceInput);

    if (!name) {
      toast({ title: "Product Name Required", description: "Please enter a name for the new item.", variant: "destructive" });
      manualItemNameRef.current?.focus();
      return;
    }
    if (!code) {
      toast({ title: "Product Code Required", description: "Please enter a unique product code for the new item.", variant: "destructive" });
      manualItemCodeRef.current?.focus();
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid quantity for the new item.", variant: "destructive" });
      manualItemQuantityRef.current?.focus();
      return;
    }
    if (isNaN(costPrice) || costPrice <= 0) {
      toast({ title: "Invalid Cost Price", description: "Please enter a valid cost price for the new item.", variant: "destructive" });
      manualItemCostRef.current?.focus();
      return;
    }
     if (isNaN(salePrice) || salePrice <= 0) {
      toast({ title: "Invalid Sale Price", description: "Please enter a valid intended sale price for the new item.", variant: "destructive" });
      manualItemSaleRef.current?.focus();
      return;
    }

    const newItem: PurchaseFormItem = {
      clientTempId: `manual_${Date.now().toString()}`,
      productId: "MANUAL_PURCHASE_ITEM", 
      productName: name,
      productCode: code,
      quantity,
      purchasePrice: costPrice,
      salePrice: salePrice,
      itemTotal: quantity * costPrice,
    };

    setItems(prev => [...prev, newItem]);
    toast({ title: "Manual Item Added", description: `${name} added to receipt.` });

    setManualItemNameInput("");
    setManualItemCodeInput("");
    setManualItemQuantityInput("1");
    setManualItemCostPriceInput("");
    setManualItemSalePriceInput("");
    manualItemNameRef.current?.focus();
  };

  const handleRemoveItem = (clientTempId: string) => {
    setItems(prev => prev.filter(item => item.clientTempId !== clientTempId));
  };

  const resetForm = () => {
    router.replace('/purchases/add');
    setIsEditMode(false);
    setEditingInvoiceId(null);
    setOriginalInvoiceData(null);
    setSelectedSupplierId(searchParams.get('supplierId') || ""); 
    setInvoiceNumber("");
    setInvoiceDate(new Date());
    setItems([]);
    setNotes("");
    setTaxAmount("0");
    setAmountPaid("0");
    resetItemEntryFields();
    setManualItemNameInput("");
    setManualItemCodeInput("");
    setManualItemQuantityInput("1");
    setManualItemCostPriceInput("");
    setManualItemSalePriceInput("");
    productCodeInputRef.current?.focus();
  }

  const proceedWithPurchaseSubmission = async (invoiceData: any) => {
    setIsSubmitting(true);
    try {
        if (isEditMode && editingInvoiceId && originalInvoiceData) {
            const { updatedPurchaseInvoice, activityEntries } = await updatePurchaseInvoiceForUser(userId!, editingInvoiceId, originalInvoiceData, invoiceData);
            toast({
                title: "Purchase Updated",
                description: `Purchase Invoice #${updatedPurchaseInvoice.numericPurchaseId} updated successfully.`,
            });
        } else {
            const { newPurchaseInvoice, activityEntries } = await addPurchaseInvoiceForUser(userId!, invoiceData);
            toast({
                title: "Purchase Recorded",
                description: `Purchase Invoice #${newPurchaseInvoice.numericPurchaseId} from ${newPurchaseInvoice.supplierName} saved successfully.`,
            });
        }
      await refreshAuthContext(true);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error Saving Purchase", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      proceedActionRef.current = null;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Authentication Error", description: "User or app settings not loaded.", variant: "destructive" });
      return;
    }
    if (!selectedSupplierId) {
      toast({ title: "Supplier Required", description: "Please select a supplier.", variant: "destructive" });
      return;
    }
    if (!invoiceDate) { 
      toast({ title: "Invoice Date Required", description: "Invoice date is required.", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Items Required", description: "Please add at least one item to the purchase.", variant: "destructive" });
      return;
    }
    const numAmountPaid = parseFloat(amountPaid) || 0;
    if (numAmountPaid < 0 || (grandTotal > 0 && numAmountPaid > grandTotal && grandTotal !==0)) { 
      toast({ title: "Invalid Amount Paid", description: "Amount paid cannot be negative or exceed grand total.", variant: "destructive" });
      return;
    }

    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    if (!supplier) {
        toast({title: "Supplier Not Found", description: "Selected supplier not found.", variant: "destructive"});
        return;
    }

    const invoiceData = {
      supplierId: selectedSupplierId,
      supplierName: supplier.name || supplier.companyName || 'Unknown Supplier',
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate.toISOString(),
      items: items.map(({ clientTempId, ...item }) => item), 
      subTotal,
      taxAmount: parseFloat(taxAmount) || 0,
      grandTotal,
      amountPaid: numAmountPaid,
      notes: notes.trim() || undefined,
    };
    
    let cashChange = 0;
    if (isEditMode && originalInvoiceData) {
        cashChange = originalInvoiceData.amountPaid - numAmountPaid;
    } else {
        cashChange = -numAmountPaid;
    }

    const currentCash = appSettings.currentBusinessCash;
    const potentialNewCash = currentCash + cashChange;


    if (numAmountPaid > 0 && cashChange < 0 && potentialNewCash < 0) {
      setNegativeCashDetails({
        currentCash: currentCash,
        debitAmount: Math.abs(cashChange),
        newBalance: potentialNewCash
      });
      proceedActionRef.current = () => proceedWithPurchaseSubmission(invoiceData);
      setIsNegativeCashConfirmOpen(true);
      return;
    }
    
    await proceedWithPurchaseSubmission(invoiceData);
  };

  const handleProductDialogSelect = (product: Product) => {
    setCurrentSelectedProduct(product);
    setCurrentProductId(product.id);
    setCurrentProductCodeInput(product.name); 
    setCurrentPurchasePrice((product.costPrice || 0).toString()); 
    setCurrentItemNewSalePrice(product.price.toString()); 
    setIsProductSelectOpen(false); 
    quantityInputRef.current?.focus();
    quantityInputRef.current?.select();
  };

  const handleGenerateInvoiceNumber = () => {
    const timestampSuffix = String(Date.now()).slice(-7);
    const generatedInv = `INV-${timestampSuffix}`;
    setInvoiceNumber(generatedInv);
    toast({ title: "Invoice Number Generated", description: `Set to: ${generatedInv}` });
  };

  if (authLoading || isLoadingData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">{isEditMode ? "Loading purchase for editing..." : "Loading purchase data..."}</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to record purchases.</p>;
  }

  return (
    <div className="space-y-6">
       <AlertDialog open={isNegativeCashConfirmOpen} onOpenChange={(open) => {
        if (!open) proceedActionRef.current = null; // Clear action if dialog is closed without confirming
        setIsNegativeCashConfirmOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Cash Balance Warning</AlertDialogTitle>
            <AlertDialogDescription>
              This transaction will result in a negative total business cash balance.
              <ul className="mt-2 list-disc list-inside text-sm">
                <li>Current Cash: {formatCurrency(negativeCashDetails?.currentCash || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li>Amount to be Debited: {formatCurrency(negativeCashDetails?.debitAmount || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li className="font-semibold">Potential New Balance: {formatCurrency(negativeCashDetails?.newBalance || 0, appSettings.currency, currencyForConversionSource)}</li>
              </ul>
              Do you want to proceed with this purchase?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => proceedActionRef.current = null} disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (proceedActionRef.current) {
                  await proceedActionRef.current();
                }
              }}
              disabled={isSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {appSettings && (
        <ProductSelectionDialog
          isOpen={isProductSelectOpen}
          onOpenChange={setIsProductSelectOpen}
          products={products}
          appSettings={appSettings}
          onProductSelect={handleProductDialogSelect}
          context="purchase"
        />
      )}
      <Card className="shadow-md">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-headline text-xl flex items-center">
                <Receipt className="mr-2 h-5 w-5 text-primary"/>
                {isEditMode ? `Edit Purchase #${originalInvoiceData?.numericPurchaseId}` : 'Record Supplier Receipt'}
              </CardTitle>
              <CardDescription>
                {isEditMode ? `You are editing an existing purchase from ${originalInvoiceData?.supplierName}.` : `Use this form to record receipts from your suppliers for goods or services received.`}
              </CardDescription>
            </div>
            {isEditMode && <Button onClick={() => router.push('/purchases/list')} variant="outline"><ArrowLeft className="mr-2 h-4 w-4"/> Back to List</Button>}
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receipt Details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supplier" className="flex items-center mb-1"><UserCircle className="mr-1 h-4 w-4 text-muted-foreground"/>Supplier</Label>
                  <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId} disabled={suppliers.length === 0 || isSubmitting}>
                    <SelectTrigger id="supplier">
                      <SelectValue placeholder={suppliers.length === 0 ? "No suppliers available" : "Select a supplier"} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name || s.companyName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="invoiceNumber" className="flex items-center mb-1"><FileText className="mr-1 h-4 w-4 text-muted-foreground"/>Supplier Invoice/Receipt #</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      id="invoiceNumber" 
                      value={invoiceNumber} 
                      onChange={e => setInvoiceNumber(e.target.value)} 
                      placeholder="e.g., INV-2023-001" 
                      disabled={isSubmitting}
                      className="flex-grow"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="icon" 
                      onClick={handleGenerateInvoiceNumber} 
                      disabled={isSubmitting}
                      title="Auto-generate Invoice Number"
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <Sparkles className="h-5 w-5" />
                      <span className="sr-only">Generate Invoice No.</span>
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="invoiceDate" className="flex items-center mb-1"><CalendarIcon className="mr-1 h-4 w-4 text-muted-foreground"/>Date of Receipt</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={`w-full justify-start text-left font-normal ${!invoiceDate && "text-muted-foreground"}`}
                        disabled={isSubmitting}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {invoiceDate ? format(invoiceDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={invoiceDate} onSelect={setInvoiceDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><PackageSearch className="mr-2 h-5 w-5"/>Received Items (from Inventory)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-end"> 
                  <div className="flex-grow relative">
                    <Label htmlFor="productCodeInput" className="flex items-center"><ScanLine className="mr-1 h-3 w-3 text-muted-foreground"/>Product Code or Name</Label>
                     <div className="flex items-center gap-2">
                        <Input
                            ref={productCodeInputRef}
                            id="productCodeInput"
                            value={currentProductCodeInput}
                            onChange={e => {setCurrentProductCodeInput(e.target.value); setCurrentSelectedProduct(null);}}
                            onFocus={() => { if (currentProductCodeInput.trim() && codeSuggestions.length > 0) setShowCodeSuggestions(true); }}
                            onBlur={() => { setTimeout(() => setShowCodeSuggestions(false), 150); }}
                            onKeyDown={handleProductCodeKeyDown}
                            placeholder="Type code/name"
                            disabled={isSubmitting}
                            autoComplete="off"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => setIsProductSelectOpen(true)} className="h-10 w-10 flex-shrink-0" title="Search Products List" disabled={products.length === 0 || isSubmitting}>
                            <ListChecks className="h-5 w-5"/>
                        </Button>
                    </div>
                    {showCodeSuggestions && codeSuggestions.length > 0 && (
                        <div className="absolute z-20 w-full bg-card border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                          {codeSuggestions.map((p, index) => (
                            <div
                              key={p.id}
                              className={cn(
                                "p-2 cursor-pointer",
                                index === highlightedSuggestionIndex ? "bg-muted-foreground/20" : "hover:bg-muted"
                              )}
                              onMouseDown={() => handleSuggestionClick(p)}
                            >
                              <p className="font-medium">{p.name}</p>
                              <p className="text-sm text-muted-foreground">Code: {p.productCode} | Stock: {p.stock}</p>
                            </div>
                          ))}
                        </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input ref={quantityInputRef} id="quantity" type="number" value={currentQuantity} onChange={e => setCurrentQuantity(e.target.value)} min="1" className="text-center" disabled={isSubmitting} onKeyDown={handleQuantityKeyDown}/>
                  </div>
                  <div>
                    <Label htmlFor="purchasePrice" className="flex items-center"><DollarSign className="mr-1 h-3 w-3 text-muted-foreground"/>Cost/Unit</Label>
                    <Input ref={purchasePriceInputRef} id="purchasePrice" type="number" value={currentPurchasePrice} onChange={e => setCurrentPurchasePrice(e.target.value)} step="0.01" min="0.01" placeholder="0.00" disabled={isSubmitting || !currentSelectedProduct} onKeyDown={handlePurchasePriceKeyDown}/>
                  </div>
                  <div>
                    <Label htmlFor="salePriceInput" className="flex items-center"><Edit className="mr-1 h-3 w-3 text-muted-foreground"/>Sale Price</Label>
                    <Input 
                      ref={salePriceInputRef} 
                      id="salePriceInput" 
                      type="number"
                      value={currentItemNewSalePrice} 
                      onChange={e => setCurrentItemNewSalePrice(e.target.value)}
                      step="0.01" 
                      min="0.01" 
                      placeholder="0.00"
                      disabled={isSubmitting || !currentSelectedProduct} 
                      onKeyDown={handleSalePriceKeyDown}
                    />
                  </div>
                  <Button type="button" onClick={handleAddItem} className="self-end h-10" disabled={isSubmitting || !currentSelectedProduct}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center"><Edit2 className="mr-2 h-5 w-5"/>Add New Product Directly to this Receipt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-end">
                        <div className="md:col-span-2">
                            <Label htmlFor="manualItemNameInput">Product Name *</Label>
                            <Input ref={manualItemNameRef} id="manualItemNameInput" value={manualItemNameInput} onChange={e => setManualItemNameInput(e.target.value)} placeholder="New product name" disabled={isSubmitting} onKeyDown={handleManualItemNameKeyDown} />
                        </div>
                        <div>
                            <Label htmlFor="manualItemCodeInput">Product Code *</Label>
                            <Input ref={manualItemCodeRef} id="manualItemCodeInput" value={manualItemCodeInput} onChange={e => setManualItemCodeInput(e.target.value.toUpperCase())} placeholder="Unique code" disabled={isSubmitting} onKeyDown={handleManualItemCodeKeyDown} />
                        </div>
                        <div>
                            <Label htmlFor="manualItemQuantityInput">Quantity *</Label>
                            <Input ref={manualItemQuantityRef} id="manualItemQuantityInput" type="number" value={manualItemQuantityInput} onChange={e => setManualItemQuantityInput(e.target.value)} min="1" className="text-center" disabled={isSubmitting} onKeyDown={handleManualItemQuantityKeyDown}/>
                        </div>
                        <div>
                            <Label htmlFor="manualItemCostPriceInput">Cost/Unit *</Label>
                            <Input ref={manualItemCostRef} id="manualItemCostPriceInput" type="number" value={manualItemCostPriceInput} onChange={e => setManualItemCostPriceInput(e.target.value)} step="0.01" min="0.01" placeholder="0.00" disabled={isSubmitting} onKeyDown={handleManualItemCostKeyDown}/>
                        </div>
                        <div>
                            <Label htmlFor="manualItemSalePriceInput">Sale Price *</Label>
                            <Input ref={manualItemSaleRef} id="manualItemSalePriceInput" type="number" value={manualItemSalePriceInput} onChange={e => setManualItemSalePriceInput(e.target.value)} step="0.01" min="0.01" placeholder="0.00" disabled={isSubmitting} onKeyDown={handleManualItemSaleKeyDown}/>
                        </div>
                        <Button type="button" onClick={handleAddNewItemToReceipt} className="self-end h-10" disabled={isSubmitting}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add New Item
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {items.length > 0 && (
                <Card>
                    <CardHeader><CardTitle className="text-lg">Items on this Receipt</CardTitle></CardHeader>
                    <CardContent className="mt-0 pt-0 max-h-60 overflow-y-auto border rounded-md">
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Price/Unit</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => (
                            <TableRow key={item.clientTempId}>
                                <TableCell>
                                    {item.productName}
                                    {item.productCode && <span className="block text-xs text-muted-foreground">Code: {item.productCode}</span>}
                                    {item.productId === "MANUAL_PURCHASE_ITEM" && <span className="block text-xs text-blue-500">(New Item)</span>}
                                </TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                                <TableCell className="text-right">{formatCurrency(item.purchasePrice, appSettings.currency, currencyForConversionSource)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(item.itemTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                                <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.clientTempId)} className="text-destructive h-7 w-7" disabled={isSubmitting}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                </TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

          </div>

          <div className="md:col-span-1 space-y-6">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-lg">Receipt Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subTotal, appSettings.currency, currencyForConversionSource)}</span>
                </div>
                <div>
                  <Label htmlFor="taxAmount">Tax Amount</Label>
                  <Input id="taxAmount" type="number" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} step="0.01" min="0" placeholder="e.g. 50.00" disabled={isSubmitting} />
                </div>
                <div className="flex justify-between text-lg font-semibold">
                  <span>Grand Total:</span>
                  <span>{formatCurrency(grandTotal, appSettings.currency, currencyForConversionSource)}</span>
                </div>
                <div>
                  <Label htmlFor="amountPaid">Total Amount Paid</Label>
                  <Input id="amountPaid" type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} step="0.01" min="0" max={grandTotal > 0 ? grandTotal : undefined} placeholder="e.g. 1000.00" disabled={isSubmitting || grandTotal <= 0 && items.length > 0} />
                </div>
                <div className="flex justify-between text-sm">
                  <span>Payment Status:</span>
                  <span className={`font-medium ${
                    paymentStatus === 'paid' ? 'text-green-600' :
                    paymentStatus === 'partially_paid' ? 'text-orange-500' :
                    'text-red-600'
                  }`}>
                    {paymentStatus.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes about this receipt/purchase..." rows={3} disabled={isSubmitting}/>
              </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-md flex items-center"><Info className="mr-2 h-4 w-4 text-blue-500"/>Information</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground pb-3">
                    <p><strong>Inventory Impact:</strong> Stock quantities for existing products will be updated. Manually added new products will be created in your inventory.</p>
                    <p><strong>Financial Impact:</strong> Payment amount will be deducted from "Total Business Cash". The total receipt value impacts Accounts Payable for the selected supplier.</p>
                </CardContent>
            </Card>

            <Button type="submit" className="w-full text-lg py-3 h-auto" disabled={isSubmitting || items.length === 0}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
              {isSubmitting ? (isEditMode ? "Saving Changes..." : "Saving Receipt...") : (isEditMode ? "Save Changes" : "Save Supplier Receipt")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
