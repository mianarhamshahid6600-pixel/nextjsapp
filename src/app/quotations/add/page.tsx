
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
import { CalendarIcon, PlusCircle, Trash2, Save, Loader2, UserCircle, FileText as FileTextIcon, DollarSign, Percent, BookUser, Edit, PackageSearch, Package, Layers, Info, ListPlus, Users, ScanLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from 'date-fns';
import { getCustomersForUser } from "@/lib/services/customer-service";
import { getProductsForUser } from "@/lib/services/product-service";
import { addQuotationForUser } from "@/lib/services/quotation-service";
import type { Customer, Product, QuotationItem, AppSettings } from "@/lib/data-types";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { useRouter } from "next/navigation";
import { CustomerSelectionDialog } from "@/components/shared/customer-selection-dialog";
import { cn } from "@/lib/utils";


interface QuotationFormItem extends QuotationItem {
  clientTempId: string;
}

export default function AddQuotationPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [manualCustomerName, setManualCustomerName] = useState<string>("");
  const [quoteDate, setQuoteDate] = useState<Date | undefined>(new Date());
  const [validTillDate, setValidTillDate] = useState<Date | undefined>(addDays(new Date(), 30));
  const [items, setItems] = useState<QuotationFormItem[]>([]);
  const [overallDiscountAmount, setOverallDiscountAmount] = useState<string>("0");
  const [overallTaxAmount, setOverallTaxAmount] = useState<string>("0");
  const [shippingCharges, setShippingCharges] = useState<string>("0");
  const [extraCosts, setExtraCosts] = useState<string>("0");
  const [termsAndConditions, setTermsAndConditions] = useState<string>("");
  const [paymentMethods, setPaymentMethods] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Current Item Entry Fields
  const [currentProductCodeInput, setCurrentProductCodeInput] = useState<string>("");
  const [currentItemName, setCurrentItemName] = useState<string>("");
  const [currentItemProductId, setCurrentItemProductId] = useState<string | undefined>(undefined);
  const [currentItemProductCode, setCurrentItemProductCode] = useState<string | undefined>(undefined);
  const [currentItemQuantity, setCurrentItemQuantity] = useState<string>("1");
  const [currentItemCostPrice, setCurrentItemCostPrice] = useState<string>("");
  const [currentItemSalePrice, setCurrentItemSalePrice] = useState<string>("");
  const [currentItemDiscountPercentage, setCurrentItemDiscountPercentage] = useState<string>("0");
  const [currentItemTaxPercentage, setCurrentItemTaxPercentage] = useState<string>("0");

  const [codeSuggestions, setCodeSuggestions] = useState<Product[]>([]);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);

  const productCodeInputRef = useRef<HTMLInputElement>(null);
  const itemNameInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const costPriceInputRef = useRef<HTMLInputElement>(null);
  const salePriceInputRef = useRef<HTMLInputElement>(null);
  const itemDiscountInputRef = useRef<HTMLInputElement>(null);
  const itemTaxInputRef = useRef<HTMLInputElement>(null);


  const [isCustomerSelectOpen, setIsCustomerSelectOpen] = useState(false);


  useEffect(() => {
    const code = currentProductCodeInput.trim().toUpperCase();
    if (code === "") {
      setCodeSuggestions([]);
      setShowCodeSuggestions(false);
      setHighlightedSuggestionIndex(-1);
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
  }, [currentProductCodeInput, products]);

  const handleSuggestionClick = (product: Product) => {
    setCurrentProductCodeInput(""); 
    setCurrentItemName(product.name);
    setCurrentItemProductId(product.id);
    setCurrentItemProductCode(product.productCode);
    setCurrentItemCostPrice((product.costPrice || 0).toString());
    setCurrentItemSalePrice(product.price.toString());
    setCurrentItemDiscountPercentage((product.discountPercentage || 0).toString());
    // Do not auto-fill quantity or tax
    
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
        } else if (codeSuggestions.length > 0 && codeSuggestions.length === 1 && currentProductCodeInput.toUpperCase() === codeSuggestions[0].productCode.toUpperCase()) {
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
         itemNameInputRef.current?.focus();
      }
    }
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      costPriceInputRef.current?.focus();
    }
  };
  const handleCostPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      salePriceInputRef.current?.focus();
    }
  };
  const handleSalePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      itemDiscountInputRef.current?.focus();
    }
  };
  const handleItemDiscountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      itemTaxInputRef.current?.focus();
    }
  };
  const handleItemTaxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };


  const fetchData = useCallback(async () => {
    if (!userId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      const [loadedCustomers, loadedProducts] = await Promise.all([
        getCustomersForUser(userId),
        getProductsForUser(userId)
      ]);
      setCustomers(loadedCustomers.filter(c => c.id !== "CUST_WALK_IN"));
      setProducts(loadedProducts);
    } catch (error) {
      console.error("Failed to load data for quotation page:", error);
      toast({ title: "Error", description: "Could not load customer or product data.", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
    }
  }, [authLoading, userId, appSettings, fetchData]);

  const calculatedTotals = useMemo(() => {
    let currentSubTotal = 0;
    let currentTotalItemDiscount = 0;
    let currentTotalItemTax = 0;

    items.forEach(item => {
      const itemSubtotal = item.quantity * item.salePrice;
      const itemDiscount = itemSubtotal * (item.discountPercentage / 100);
      const priceAfterItemDiscount = itemSubtotal - itemDiscount;
      const itemTax = priceAfterItemDiscount * (item.taxPercentage / 100);

      currentSubTotal += itemSubtotal;
      currentTotalItemDiscount += itemDiscount;
      currentTotalItemTax += itemTax;
    });

    const numOverallDiscount = parseFloat(overallDiscountAmount) || 0;
    const numOverallTax = parseFloat(overallTaxAmount) || 0;
    const numShipping = parseFloat(shippingCharges) || 0;
    const numExtraCosts = parseFloat(extraCosts) || 0;
    
    const priceAfterItemLevelAdjustments = currentSubTotal - currentTotalItemDiscount + currentTotalItemTax;
    const priceAfterOverallDiscount = priceAfterItemLevelAdjustments - numOverallDiscount;
    const currentGrandTotal = priceAfterOverallDiscount + numOverallTax + numShipping + numExtraCosts;

    return {
      subTotal: currentSubTotal,
      totalItemDiscount: currentTotalItemDiscount,
      totalItemTax: currentTotalItemTax,
      overallDiscount: numOverallDiscount,
      overallTax: numOverallTax,
      shipping: numShipping,
      extraCosts: numExtraCosts,
      grandTotal: currentGrandTotal,
    };
  }, [items, overallDiscountAmount, overallTaxAmount, shippingCharges, extraCosts]);


  const handleAddItem = () => {
    if (!currentItemName.trim()) {
      toast({ title: "Error", description: "Product/Service name is required.", variant: "destructive" });
      return;
    }
    const quantity = parseInt(currentItemQuantity, 10);
    const salePrice = parseFloat(currentItemSalePrice);
    const costPrice = parseFloat(currentItemCostPrice) || 0;
    const discountPercentage = parseFloat(currentItemDiscountPercentage) || 0;
    const taxPercentage = parseFloat(currentItemTaxPercentage) || 0;

    if (isNaN(quantity) || quantity <= 0) {
      toast({ title: "Error", description: "Please enter a valid quantity.", variant: "destructive" });
      return;
    }
    if (isNaN(salePrice) || salePrice <= 0) {
      toast({ title: "Error", description: "Please enter a valid sale price.", variant: "destructive" });
      return;
    }
    if (isNaN(costPrice) || costPrice < 0) {
      toast({ title: "Error", description: "Cost price must be a non-negative number.", variant: "destructive"});
      return;
    }
    if (isNaN(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
      toast({ title: "Error", description: "Item discount must be between 0 and 100.", variant: "destructive" });
      return;
    }
     if (isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      toast({ title: "Error", description: "Item tax must be between 0 and 100.", variant: "destructive" });
      return;
    }

    const itemSubtotal = quantity * salePrice;
    const itemDiscountAmount = itemSubtotal * (discountPercentage / 100);
    const priceAfterItemDiscount = itemSubtotal - itemDiscountAmount;
    const itemTaxAmount = priceAfterItemDiscount * (taxPercentage / 100);
    const itemTotal = priceAfterItemDiscount + itemTaxAmount;

    const newItem: QuotationFormItem = {
      clientTempId: Date.now().toString(),
      productId: currentItemProductId,
      productCode: currentItemProductCode,
      name: currentItemName.trim(),
      quantity,
      salePrice,
      costPrice: costPrice,
      discountPercentage,
      taxPercentage,
      itemSubtotal,
      itemDiscountAmount,
      priceAfterItemDiscount,
      itemTaxAmount,
      itemTotal,
    };
    setItems(prev => [...prev, newItem]);
    setCurrentProductCodeInput("");
    setCurrentItemName("");
    setCurrentItemProductId(undefined);
    setCurrentItemProductCode(undefined);
    setCurrentItemQuantity("1");
    setCurrentItemSalePrice("");
    setCurrentItemCostPrice("");
    setCurrentItemDiscountPercentage("0");
    setCurrentItemTaxPercentage("0");
    productCodeInputRef.current?.focus();
  };

  const handleRemoveItem = (clientTempId: string) => {
    setItems(prev => prev.filter(item => item.clientTempId !== clientTempId));
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setManualCustomerName("");
    setQuoteDate(new Date());
    setValidTillDate(addDays(new Date(), 30));
    setItems([]);
    setOverallDiscountAmount("0");
    setOverallTaxAmount("0");
    setShippingCharges("0");
    setExtraCosts("0");
    setTermsAndConditions("");
    setPaymentMethods("");
    setNotes("");
    setCurrentProductCodeInput("");
    setCurrentItemName("");
    setCurrentItemProductId(undefined);
    setCurrentItemProductCode(undefined);
    setCurrentItemQuantity("1");
    setCurrentItemSalePrice("");
    setCurrentItemCostPrice("");
    setCurrentItemDiscountPercentage("0");
    setCurrentItemTaxPercentage("0");
    productCodeInputRef.current?.focus();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Error", description: "User or app settings not loaded.", variant: "destructive" });
      return;
    }
    
    const finalCustomerName = selectedCustomerId 
        ? (customers.find(c => c.id === selectedCustomerId)?.name || "Unknown Customer") 
        : manualCustomerName.trim();

    if (!finalCustomerName) {
        toast({ title: "Error", description: "Please select or enter a customer name.", variant: "destructive" });
        return;
    }
    
    if (!quoteDate || !validTillDate) {
      toast({ title: "Error", description: "Quote Date and Valid Till Date are required.", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Error", description: "Please add at least one item to the quotation.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    const selectedCustomerData = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) : null;

    const quotationPayload = {
      customerId: selectedCustomerId || undefined,
      customerName: finalCustomerName,
      customerDetails: selectedCustomerData ? {
        email: selectedCustomerData.email,
        phone: selectedCustomerData.phone,
        address: selectedCustomerData.address,
      } : undefined,
      quoteDate: quoteDate.toISOString(),
      validTillDate: validTillDate.toISOString(),
      items: items.map(({ clientTempId, ...item }) => item), 
      subTotal: calculatedTotals.subTotal,
      totalItemDiscountAmount: calculatedTotals.totalItemDiscount,
      totalItemTaxAmount: calculatedTotals.totalItemTax,
      overallDiscountAmount: calculatedTotals.overallDiscount,
      overallTaxAmount: calculatedTotals.overallTax,
      shippingCharges: calculatedTotals.shipping,
      extraCosts: calculatedTotals.extraCosts,
      grandTotal: calculatedTotals.grandTotal,
      termsAndConditions: termsAndConditions.trim() || undefined,
      paymentMethods: paymentMethods.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    try {
      const { newQuotation, activityEntry } = await addQuotationForUser(userId, quotationPayload);
      toast({
        title: "Quotation Saved",
        description: `Quotation #${newQuotation.numericQuotationId} for ${newQuotation.customerName} saved as Draft.`,
      });
      resetForm();
      router.push("/quotations");
    } catch (error: any) {
      toast({ title: "Error Saving Quotation", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomerDialogSelect = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setManualCustomerName(""); 
    setIsCustomerSelectOpen(false);
  };


  if (authLoading || isLoadingData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading data...</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to create quotations.</p>;
  }

  return (
    <div className="space-y-6">
      {appSettings && (
          <CustomerSelectionDialog
            isOpen={isCustomerSelectOpen}
            onOpenChange={setIsCustomerSelectOpen}
            customers={customers}
            onCustomerSelect={handleCustomerDialogSelect}
          />
      )}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center"><FileTextIcon className="mr-2 h-5 w-5 text-primary"/>Create New Quotation</CardTitle>
          <CardDescription>Fill in the details to generate a new quotation.</CardDescription>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center"><BookUser className="mr-2 h-5 w-5"/>Customer & Dates</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1 space-y-1">
                  <Label htmlFor="customerSelect">Select Customer</Label>
                  <div className="flex items-center gap-2">
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} disabled={customers.length === 0 || isSubmitting}>
                      <SelectTrigger id="customerSelect"><SelectValue placeholder={customers.length === 0 ? "No customers" : "Select registered customer"} /></SelectTrigger>
                      <SelectContent>
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" onClick={() => setIsCustomerSelectOpen(true)} className="h-10 w-10 flex-shrink-0" title="Search Customers" disabled={customers.length === 0 || isSubmitting}><Users className="h-5 w-5"/></Button>
                  </div>
                  <Label htmlFor="manualCustomerName" className="mt-2">Or Enter Customer Name</Label>
                  <Input id="manualCustomerName" value={manualCustomerName} onChange={e => { setManualCustomerName(e.target.value); if (e.target.value) setSelectedCustomerId(""); }} placeholder="Manual Customer Name" disabled={isSubmitting} />
                </div>
                <div>
                  <Label htmlFor="quoteDate">Quote Date</Label>
                  <Popover>
                    <PopoverTrigger asChild><Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!quoteDate && "text-muted-foreground"}`} disabled={isSubmitting}><CalendarIcon className="mr-2 h-4 w-4" />{quoteDate ? format(quoteDate, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={quoteDate} onSelect={setQuoteDate} initialFocus /></PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="validTillDate">Valid Till</Label>
                  <Popover>
                    <PopoverTrigger asChild><Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!validTillDate && "text-muted-foreground"}`} disabled={isSubmitting}><CalendarIcon className="mr-2 h-4 w-4" />{validTillDate ? format(validTillDate, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={validTillDate} onSelect={setValidTillDate} initialFocus /></PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center"><ListPlus className="mr-2 h-5 w-5"/>Quotation Items</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-[1.5fr_2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-end p-3 border rounded-md bg-muted/20">
                    <div className="relative">
                        <Label htmlFor="itemProductCode" className="flex items-center"><ScanLine className="mr-1 h-3 w-3"/>Code</Label>
                        <Input
                            ref={productCodeInputRef}
                            id="itemProductCode"
                            value={currentProductCodeInput}
                            onChange={e => setCurrentProductCodeInput(e.target.value.toUpperCase())}
                            onFocus={() => { if (currentProductCodeInput.trim() && codeSuggestions.length > 0) setShowCodeSuggestions(true); }}
                            onBlur={() => { setTimeout(() => setShowCodeSuggestions(false), 150); }}
                            onKeyDown={handleProductCodeKeyDown}
                            placeholder="Type code/name"
                            disabled={isSubmitting}
                            autoComplete="off"
                        />
                        {showCodeSuggestions && codeSuggestions.length > 0 && (
                            <div className="absolute z-20 w-full bg-card border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                            {codeSuggestions.map((p, index) => (
                                <div
                                key={p.id}
                                className={cn("p-2 cursor-pointer", index === highlightedSuggestionIndex ? "bg-muted-foreground/20" : "hover:bg-muted")}
                                onMouseDown={() => handleSuggestionClick(p)}
                                >
                                <p className="font-medium">{p.name}</p>
                                <p className="text-sm text-muted-foreground">Code: {p.productCode} | Stock: {p.stock}</p>
                                </div>
                            ))}
                            </div>
                        )}
                    </div>
                    <div><Label htmlFor="itemName">Product / Service</Label><Input ref={itemNameInputRef} id="itemName" value={currentItemName} onChange={e => setCurrentItemName(e.target.value)} placeholder="Item name or service" disabled={isSubmitting}/></div>
                    <div><Label htmlFor="itemQty">Quantity</Label><Input ref={quantityInputRef} id="itemQty" type="number" value={currentItemQuantity} onChange={e => setCurrentItemQuantity(e.target.value)} min="1" className="text-center" disabled={isSubmitting} onKeyDown={handleQuantityKeyDown}/></div>
                    <div><Label htmlFor="itemCostPrice">Cost Price</Label><Input ref={costPriceInputRef} id="itemCostPrice" type="number" value={currentItemCostPrice} onChange={e => setCurrentItemCostPrice(e.target.value)} step="0.01" min="0" placeholder="0.00" disabled={isSubmitting} onKeyDown={handleCostPriceKeyDown}/></div>
                    <div><Label htmlFor="itemSalePrice">Sale Price</Label><Input ref={salePriceInputRef} id="itemSalePrice" type="number" value={currentItemSalePrice} onChange={e => setCurrentItemSalePrice(e.target.value)} step="0.01" min="0.01" placeholder="0.00" disabled={isSubmitting} onKeyDown={handleSalePriceKeyDown}/></div>
                    <div><Label htmlFor="itemDisc" className="flex items-center"><Percent className="mr-1 h-3 w-3"/>Disc.</Label><Input ref={itemDiscountInputRef} id="itemDisc" type="number" value={currentItemDiscountPercentage} onChange={e => setCurrentItemDiscountPercentage(e.target.value)} step="0.01" min="0" max="100" placeholder="0" disabled={isSubmitting} onKeyDown={handleItemDiscountKeyDown}/></div>
                    <div><Label htmlFor="itemTax" className="flex items-center"><Percent className="mr-1 h-3 w-3"/>Tax</Label><Input ref={itemTaxInputRef} id="itemTax" type="number" value={currentItemTaxPercentage} onChange={e => setCurrentItemTaxPercentage(e.target.value)} step="0.01" min="0" max="100" placeholder="0" disabled={isSubmitting} onKeyDown={handleItemTaxKeyDown}/></div>
                    <Button type="button" onClick={handleAddItem} className="self-end h-10 md:mt-0 mt-3 w-full md:w-auto" disabled={isSubmitting}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                </div>


                {items.length > 0 && (
                  <div className="mt-4 max-h-72 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product/Service</TableHead><TableHead className="text-center">Qty</TableHead><TableHead className="text-right">Cost Price</TableHead><TableHead className="text-right">Sale Price</TableHead><TableHead className="text-center">Disc %</TableHead><TableHead className="text-center">Tax %</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {items.map(item => (
                          <TableRow key={item.clientTempId}>
                            <TableCell className="max-w-[200px] truncate">{item.name}{item.productCode && <span className="block text-xs text-muted-foreground">Code: {item.productCode}</span>}</TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.costPrice || 0, appSettings.currency, currencyForConversionSource)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.salePrice, appSettings.currency, currencyForConversionSource)}</TableCell>
                            <TableCell className="text-center">{item.discountPercentage}%</TableCell>
                            <TableCell className="text-center">{item.taxPercentage}%</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.itemTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                            <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.clientTempId)} className="text-destructive h-7 w-7" disabled={isSubmitting}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center"><Info className="mr-2 h-5 w-5"/>Additional Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label htmlFor="terms">Terms & Conditions</Label><Textarea id="terms" value={termsAndConditions} onChange={e => setTermsAndConditions(e.target.value)} placeholder="E.g., Payment due within 30 days..." rows={3} disabled={isSubmitting}/></div>
                <div><Label htmlFor="paymentMethods">Payment Methods</Label><Textarea id="paymentMethods" value={paymentMethods} onChange={e => setPaymentMethods(e.target.value)} placeholder="E.g., Bank Transfer, Credit Card..." rows={2} disabled={isSubmitting}/></div>
                <div><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal or customer-facing notes..." rows={2} disabled={isSubmitting}/></div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card className="sticky top-20">
              <CardHeader><CardTitle className="text-lg flex items-center"><Layers className="mr-2 h-5 w-5"/>Quotation Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between"><span>Subtotal (Items):</span><span>{formatCurrency(calculatedTotals.subTotal, appSettings.currency, currencyForConversionSource)}</span></div>
                <div className="flex justify-between"><span>Total Item Discount:</span><span className="text-green-600">-{formatCurrency(calculatedTotals.totalItemDiscount, appSettings.currency, currencyForConversionSource)}</span></div>
                <div className="flex justify-between"><span>Total Item Tax:</span><span>{formatCurrency(calculatedTotals.totalItemTax, appSettings.currency, currencyForConversionSource)}</span></div>
                <hr/>
                <div><Label htmlFor="overallDiscount">Overall Discount Amount</Label><Input id="overallDiscount" type="number" value={overallDiscountAmount} onChange={e => setOverallDiscountAmount(e.target.value)} step="0.01" min="0" placeholder="0.00" disabled={isSubmitting}/></div>
                <div><Label htmlFor="overallTax">Additional Flat Tax Amount</Label><Input id="overallTax" type="number" value={overallTaxAmount} onChange={e => setOverallTaxAmount(e.target.value)} step="0.01" min="0" placeholder="0.00" disabled={isSubmitting}/></div>
                <div><Label htmlFor="shipping">Shipping Charges</Label><Input id="shipping" type="number" value={shippingCharges} onChange={e => setShippingCharges(e.target.value)} step="0.01" min="0" placeholder="0.00" disabled={isSubmitting}/></div>
                <div><Label htmlFor="extraCosts">Extra Costs</Label><Input id="extraCosts" type="number" value={extraCosts} onChange={e => setExtraCosts(e.target.value)} step="0.01" min="0" placeholder="0.00" disabled={isSubmitting}/></div>
                <hr/>
                <div className="flex justify-between text-xl font-bold pt-2"><span>Grand Total:</span><span>{formatCurrency(calculatedTotals.grandTotal, appSettings.currency, currencyForConversionSource)}</span></div>
              </CardContent>
              <CardContent className="border-t pt-4">
                <Button type="submit" className="w-full text-lg py-3 h-auto" disabled={isSubmitting || items.length === 0}>
                  {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

