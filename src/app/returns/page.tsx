
"use client";

import { useState, type FormEvent, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PackageOpen, RotateCcw, FileSearch, UserCircle, ShoppingBag, DollarSign, InfoIcon, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Sale, SaleItem, ReturnItem as DataReturnItem, AppSettings, Return as ReturnType } from "@/lib/data-types";
import { useAuth } from "@/contexts/auth-context";
import { getSaleByNumericIdForUser, getSalesForUser } from "@/lib/services/sale-service";
import { addReturnForUser, type ProcessReturnInput } from "@/lib/services/return-service";
import { getReturnsForUser } from "@/lib/services/return-service";
import { formatCurrency } from "@/lib/currency-utils";
import { cn } from "@/lib/utils";

interface FormReturnItem extends DataReturnItem {
  selected: boolean;
  maxReturnableQuantity: number; // Max quantity that *can still* be returned for this item
  originalSalePrice: number; 
  productId: string;
  productCode?: string;
  productName: string;
  originalSaleQuantity: number; // Total quantity of this item in the original sale
}

const commonReturnReasons = [
  "Damaged Item",
  "Wrong Item Shipped",
  "Customer Changed Mind",
  "Defective Product",
  "Size/Fit Issue",
  "Other (Specify in Notes)",
];

const commonRefundMethods = [
  "Cash",
  "Original Payment Method",
  "Store Credit",
  "Bank Transfer",
];

export default function RecordReturnPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth();

  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [allReturns, setAllReturns] = useState<ReturnType[]>([]);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState<string>("");
  const [loadedSale, setLoadedSale] = useState<Sale | null>(null);
  const [customerNameDisplay, setCustomerNameDisplay] = useState<string>("");
  const [itemsForReturn, setItemsForReturn] = useState<FormReturnItem[]>([]);
  
  const [overallReason, setOverallReason] = useState<string>(commonReturnReasons[0]);
  const [customReason, setCustomReason] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<string>(commonRefundMethods[0]);
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState<string>("0");
  const [adjustmentType, setAdjustmentType] = useState<'deduct' | 'add'>('deduct');
  const [returnNotes, setReturnNotes] = useState<string>("");

  const [isFetchingSale, setIsFetchingSale] = useState(false);
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [isSaleFullyReturned, setIsSaleFullyReturned] = useState(false);

  const [invoiceSuggestions, setInvoiceSuggestions] = useState<Sale[]>([]);
  const [showInvoiceSuggestions, setShowInvoiceSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  const fetchInitialData = useCallback(async () => {
    if (!userId) {
      setIsLoadingInitialData(false);
      return;
    }
    setIsLoadingInitialData(true);
    try {
      const [salesData, returnsData] = await Promise.all([
        getSalesForUser(userId),
        getReturnsForUser(userId)
      ]);
      setAllSales(salesData);
      setAllReturns(returnsData);
    } catch (error) {
      console.error("Failed to fetch initial data for returns page:", error);
      toast({ title: "Error", description: "Could not load sales or returns data.", variant: "destructive" });
    } finally {
      setIsLoadingInitialData(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchInitialData();
    }
  }, [authLoading, userId, appSettings, fetchInitialData]);


  useEffect(() => {
    const input = invoiceNumberInput.trim().toLowerCase();
    if (input === "" || !allSales.length) {
      setInvoiceSuggestions([]);
      setShowInvoiceSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      return;
    }

    const filtered = allSales.filter(sale =>
      sale.numericSaleId.toString().includes(input) ||
      (sale.customerName && sale.customerName.toLowerCase().includes(input))
    );
    setInvoiceSuggestions(filtered.slice(0, 7)); 
    setHighlightedSuggestionIndex(filtered.length > 0 ? 0 : -1);
    if (filtered.length > 0 && document.activeElement === invoiceInputRef.current) {
        setShowInvoiceSuggestions(true);
    } else if (filtered.length === 0) {
        setShowInvoiceSuggestions(false);
    }
  }, [invoiceNumberInput, allSales]);

  const handleInvoiceSuggestionClick = (sale: Sale) => {
    setInvoiceNumberInput(sale.numericSaleId.toString());
    setShowInvoiceSuggestions(false);
    setInvoiceSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    handleLoadInvoice(sale.numericSaleId.toString()); 
  };

  const handleInvoiceInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showInvoiceSuggestions && invoiceSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => (prev + 1) % invoiceSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => (prev - 1 + invoiceSuggestions.length) % invoiceSuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < invoiceSuggestions.length) {
          handleInvoiceSuggestionClick(invoiceSuggestions[highlightedSuggestionIndex]);
        } else if (invoiceSuggestions.length === 1) {
          handleInvoiceSuggestionClick(invoiceSuggestions[0]);
        } else {
          handleLoadInvoice(); 
        }
      } else if (e.key === 'Escape') {
        setShowInvoiceSuggestions(false);
        setHighlightedSuggestionIndex(-1);
      }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        handleLoadInvoice();
    }
  };


  const handleLoadInvoice = async (idToLoad?: string) => {
    const targetInvoiceIdStr = idToLoad || invoiceNumberInput.trim();
    if (!userId || !targetInvoiceIdStr) {
      toast({ title: "Invoice Number Required", description: "Please enter an invoice number to load.", variant: "destructive" });
      return;
    }
    setIsFetchingSale(true);
    setLoadedSale(null);
    setItemsForReturn([]);
    setCustomerNameDisplay("");
    setShowInvoiceSuggestions(false); 
    setIsSaleFullyReturned(false);

    try {
      const sale = await getSaleByNumericIdForUser(userId, parseInt(targetInvoiceIdStr, 10));
      if (sale) {
        setLoadedSale(sale);
        setCustomerNameDisplay(sale.customerName || "N/A");

        const previousReturnsForThisSale = allReturns.filter(r => r.originalSaleId === sale.id);
        const alreadyReturnedQuantitiesMap = new Map<string, number>();
        previousReturnsForThisSale.forEach(ret => {
          ret.items.forEach(item => {
            if (item.productId !== "MANUAL_ENTRY") {
              alreadyReturnedQuantitiesMap.set(item.productId, (alreadyReturnedQuantitiesMap.get(item.productId) || 0) + item.quantityReturned);
            }
          });
        });
        
        const returnableItems = sale.items.map((item): FormReturnItem => {
          const alreadyReturnedQty = alreadyReturnedQuantitiesMap.get(item.productId) || 0;
          const maxReturnable = Math.max(0, item.quantity - alreadyReturnedQty);
          return {
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            quantityReturned: 0, 
            originalSalePrice: item.price, 
            itemSubtotal: 0,
            selected: false,
            maxReturnableQuantity: maxReturnable,
            originalSaleQuantity: item.quantity,
          };
        }).filter(item => item.productId !== "MANUAL_ENTRY" && item.maxReturnableQuantity > 0); // Filter out manual items and fully returned items here

        setItemsForReturn(returnableItems);

        if (returnableItems.length === 0 && sale.items.some(i => i.productId !== "MANUAL_ENTRY")) {
          setIsSaleFullyReturned(true);
          toast({ title: "Invoice Fully Returned", description: `All items from Invoice #${sale.numericSaleId} have already been returned.`, variant: "default" });
        } else if (returnableItems.length === 0 && !sale.items.some(i => i.productId !== "MANUAL_ENTRY")) {
            setIsSaleFullyReturned(true); // Consider it "fully returned" if only manual items were on sale
            toast({ title: "No Returnable Items", description: `Invoice #${sale.numericSaleId} contains only manual items which cannot be returned through this system.`, variant: "default" });
        } else {
          toast({ title: "Invoice Loaded", description: `Details for Invoice #${sale.numericSaleId} loaded.` });
        }

      } else {
        toast({ title: "Invoice Not Found", description: `No sale found with Invoice Number ${targetInvoiceIdStr}.`, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error Loading Invoice", description: error.message || "Failed to load invoice details.", variant: "destructive" });
    } finally {
      setIsFetchingSale(false);
    }
  };

  const handleItemSelectionChange = (itemId: string, selected: boolean) => {
    setItemsForReturn(prevItems => prevItems.map(item =>
      item.productId === itemId ? { ...item, selected, quantityReturned: selected && item.quantityReturned === 0 ? 1 : (selected ? item.quantityReturned : 0) } : item
    ));
  };

  const handleQuantityToReturnChange = (itemId: string, quantityStr: string) => {
    setItemsForReturn(prevItems => prevItems.map(item => {
      if (item.productId === itemId) {
        let quantity = parseInt(quantityStr, 10);
        // Allow 0 for temporary input, but enforce min 1 on process if selected
        if (isNaN(quantity) || quantity < 0) quantity = 0; 
        if (quantity > item.maxReturnableQuantity) quantity = item.maxReturnableQuantity;
        return { ...item, quantityReturned: quantity };
      }
      return item;
    }));
  };

  const selectedItemsToReturn = useMemo(() => {
    return itemsForReturn.filter(item => item.selected && item.quantityReturned > 0);
  }, [itemsForReturn]);

  const returnSummary = useMemo(() => {
    const subtotal = selectedItemsToReturn.reduce((sum, item) => sum + (item.quantityReturned * item.originalSalePrice), 0);
    const adjustment = parseFloat(adjustmentAmountInput) || 0;
    const netRefund = adjustmentType === 'deduct'
        ? Math.max(0, subtotal - adjustment)
        : subtotal + adjustment;
    return { subtotal, adjustment, netRefund };
  }, [selectedItemsToReturn, adjustmentAmountInput, adjustmentType]);


  const handleProcessReturn = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Error", description: "User or app settings not loaded.", variant: "destructive" });
      return;
    }
    if (selectedItemsToReturn.length === 0) {
      toast({ title: "No Items Selected", description: "Please select items and valid quantities to return.", variant: "destructive" });
      return;
    }
    if (isSaleFullyReturned) {
      toast({ title: "Cannot Process", description: "This sale has already been fully returned.", variant: "destructive" });
      return;
    }
    const finalReason = overallReason === "Other (Specify in Notes)" ? (customReason.trim() || "Other") : overallReason;

    setIsProcessingReturn(true);

    const processInput: ProcessReturnInput = {
      userId,
      originalSaleId: loadedSale?.id,
      originalNumericSaleId: loadedSale?.numericSaleId,
      customerId: loadedSale?.customerId,
      customerName: customerNameDisplay || "Unknown Customer",
      itemsToReturn: selectedItemsToReturn.map(item => ({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        quantityReturned: item.quantityReturned,
        originalSalePrice: item.originalSalePrice,
        returnReason: finalReason, 
        itemSubtotal: item.quantityReturned * item.originalSalePrice,
      })),
      overallReason: finalReason,
      refundMethod: refundMethod,
      adjustmentAmount: returnSummary.adjustment,
      adjustmentType: adjustmentType,
      notes: returnNotes.trim() || undefined, 
    };

    try {
      const { newReturn, activityEntries, businessTransaction } = await addReturnForUser(processInput);
      toast({
        title: "Return Processed Successfully",
        description: `Return #${newReturn.numericReturnId} created. Net refund to customer: ${formatCurrency(newReturn.netRefundAmount, appSettings.currency, currencyForConversionSource)}.`,
        duration: 7000,
      });
      setInvoiceNumberInput("");
      setLoadedSale(null);
      setCustomerNameDisplay("");
      setItemsForReturn([]);
      setOverallReason(commonReturnReasons[0]);
      setCustomReason("");
      setRefundMethod(commonRefundMethods[0]);
      setAdjustmentAmountInput("0");
      setReturnNotes("");
      setIsSaleFullyReturned(false);
      fetchInitialData();

    } catch (error: any) {
      toast({ title: "Error Processing Return", description: error.message || "Failed to process return.", variant: "destructive" });
    } finally {
      setIsProcessingReturn(false);
    }
  };

  if (authLoading || !appSettings || isLoadingInitialData) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-3">Loading returns system...</p></div>;
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to process returns.</p>;
  }

  return (
    <form onSubmit={handleProcessReturn} className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center"><PackageOpen className="mr-3 h-7 w-7 text-primary"/>Record Product Return</CardTitle>
          <CardDescription className="text-sm">
            Process returns by loading an original invoice. Returned items will be added back to inventory, and business cash will be adjusted.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center"><FileSearch className="mr-2 h-5 w-5"/>Load Original Invoice</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-2 relative">
              <div className="flex-grow">
                <Label htmlFor="invoiceNumberInput">Original Invoice Number or Customer Name</Label>
                <Input
                  ref={invoiceInputRef}
                  id="invoiceNumberInput"
                  type="text"
                  value={invoiceNumberInput}
                  onChange={(e) => setInvoiceNumberInput(e.target.value)}
                  onFocus={() => { if (invoiceNumberInput.trim() && invoiceSuggestions.length > 0) setShowInvoiceSuggestions(true); }}
                  onBlur={() => { setTimeout(() => setShowInvoiceSuggestions(false), 150); }}
                  onKeyDown={handleInvoiceInputKeyDown}
                  placeholder="Enter Inv # or Customer Name"
                  disabled={isFetchingSale || isProcessingReturn}
                  autoComplete="off"
                />
                 {showInvoiceSuggestions && invoiceSuggestions.length > 0 && (
                  <div className="absolute z-20 w-full bg-card border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {invoiceSuggestions.map((sale, index) => (
                      <div
                        key={sale.id}
                        className={cn(
                          "p-2 cursor-pointer",
                          index === highlightedSuggestionIndex ? "bg-muted-foreground/20" : "hover:bg-muted"
                        )}
                        onMouseDown={() => handleInvoiceSuggestionClick(sale)}
                      >
                        <p className="font-medium">#{sale.numericSaleId}</p>
                        <p className="text-sm text-muted-foreground">{sale.customerName || "N/A"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" onClick={() => handleLoadInvoice()} disabled={isFetchingSale || isProcessingReturn || !invoiceNumberInput}>
                {isFetchingSale ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isFetchingSale ? "Loading..." : "Load Details"}
              </Button>
            </CardContent>
          </Card>

          {loadedSale && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><ShoppingBag className="mr-2 h-5 w-5"/>Items from Invoice #{loadedSale.numericSaleId}</CardTitle>
                <CardDescription>Customer: {customerNameDisplay}</CardDescription>
                {isSaleFullyReturned && (
                    <p className="text-sm text-destructive mt-2 flex items-center"><Ban className="mr-2 h-4 w-4"/>All returnable items from this invoice have already been processed.</p>
                )}
              </CardHeader>
              <CardContent>
                {itemsForReturn.length > 0 && !isSaleFullyReturned ? (
                  <ScrollArea className="max-h-80 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center">Sold Qty</TableHead>
                          <TableHead className="text-right">Price Paid</TableHead>
                          <TableHead className="w-32 text-center">Qty to Return</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemsForReturn.map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell><Checkbox checked={item.selected} onCheckedChange={(checked) => handleItemSelectionChange(item.productId, !!checked)} disabled={isProcessingReturn || item.maxReturnableQuantity === 0} /></TableCell>
                            <TableCell>
                              {item.productName}
                              {item.productCode && <span className="block text-xs text-muted-foreground">Code: {item.productCode}</span>}
                            </TableCell>
                            <TableCell className="text-center">{item.originalSaleQuantity} ({item.maxReturnableQuantity} left)</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.originalSalePrice, appSettings.currency, currencyForConversionSource)}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={item.quantityReturned.toString()}
                                onChange={(e) => handleQuantityToReturnChange(item.productId, e.target.value)}
                                min="0"
                                max={item.maxReturnableQuantity.toString()}
                                className="h-8 text-center"
                                disabled={!item.selected || isProcessingReturn || item.maxReturnableQuantity === 0}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : !isSaleFullyReturned ? <p className="text-muted-foreground">No items found on this invoice or items cannot be returned.</p> : null}
              </CardContent>
            </Card>
          )}
          
          {!loadedSale && itemsForReturn.length === 0 && ( 
             <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-orange-500"/>Load Invoice to Proceed</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        To return specific items from a sale, please load the invoice first using the section above.
                    </p>
                </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><InfoIcon className="mr-2 h-5 w-5"/>Return & Refund Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="overallReason">Reason for Return</Label>
                <Select value={overallReason} onValueChange={setOverallReason} disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || isSaleFullyReturned}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {commonReturnReasons.map(reason => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                  </SelectContent>
                </Select>
                {overallReason === "Other (Specify in Notes)" && (
                  <Input 
                    value={customReason} 
                    onChange={(e) => setCustomReason(e.target.value)} 
                    placeholder="Specify other reason" 
                    className="mt-2"
                    disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || isSaleFullyReturned} 
                  />
                )}
              </div>
              <div>
                <Label htmlFor="refundMethod">Refund Method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod} disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || isSaleFullyReturned}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {commonRefundMethods.map(method => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
               <div>
                <Label htmlFor="returnNotes">Additional Notes (Optional)</Label>
                <Textarea id="returnNotes" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Any extra details about the return..." disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || isSaleFullyReturned}/>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="sticky top-20">
            <CardHeader><CardTitle className="text-lg flex items-center"><DollarSign className="mr-2 h-5 w-5"/>Refund Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span>Subtotal of Returned Items:</span>
                <span>{formatCurrency(returnSummary.subtotal, appSettings.currency, currencyForConversionSource)}</span>
              </div>
              <div>
                <Label htmlFor="adjustmentAmount">Adjustment ({appSettings.currency})</Label>
                  <div className="flex gap-2 items-center">
                    <Select value={adjustmentType} onValueChange={(v: 'deduct' | 'add') => setAdjustmentType(v)} disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || isSaleFullyReturned}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deduct">Deduct Fee</SelectItem>
                        <SelectItem value="add">Add Credit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="adjustmentAmount"
                      type="number"
                      value={adjustmentAmountInput}
                      onChange={(e) => setAdjustmentAmountInput(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-9 flex-grow"
                      disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || isSaleFullyReturned}
                    />
                  </div>
              </div>
              {returnSummary.adjustment > 0 && (
                <div className={`flex justify-between ${adjustmentType === 'deduct' ? 'text-destructive' : 'text-green-600 dark:text-green-500'}`}>
                  <span>{adjustmentType === 'deduct' ? 'Fee Deducted:' : 'Credit Added:'}</span>
                  <span>{adjustmentType === 'deduct' ? '-' : '+'}{formatCurrency(returnSummary.adjustment, appSettings.currency, currencyForConversionSource)}</span>
                </div>
              )}
              <hr/>
              <div className="flex justify-between text-xl font-bold pt-2">
                <span>Net Refund Due:</span>
                <span>{formatCurrency(returnSummary.netRefund, appSettings.currency, currencyForConversionSource)}</span>
              </div>
            </CardContent>
            <CardContent className="border-t pt-4">
              <Button type="submit" className="w-full text-lg py-3 h-auto" disabled={isProcessingReturn || selectedItemsToReturn.length === 0 || returnSummary.netRefund < 0 || isSaleFullyReturned}>
                {isProcessingReturn ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RotateCcw className="mr-2 h-5 w-5" />}
                {isProcessingReturn ? "Processing..." : "Process Return"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4"><CardTitle className="text-md flex items-center"><PackageOpen className="mr-2 h-4 w-4 text-blue-500"/>Inventory Update</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground pb-4">Returned items will be added back to your inventory stock count.</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4"><CardTitle className="text-md flex items-center"><DollarSign className="mr-2 h-4 w-4 text-green-500"/>Financial Update</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground pb-4">The Net Refund Due will be subtracted from your Total Business Cash balance.</CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
