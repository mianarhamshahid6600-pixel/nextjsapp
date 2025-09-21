
"use client";

import { useState, type FormEvent, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, PlusCircle, Trash2, Save, Loader2, UserCircle, FileText as FileTextIcon, DollarSign, Percent, BookUser, Edit as EditIcon, PackageSearch, Package, Layers, Info, ListPlus, Users, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, parseISO, isValid } from 'date-fns';
import { getCustomersForUser } from "@/lib/services/customer-service";
import { getProductsForUser } from "@/lib/services/product-service";
import { getQuotationByIdForUser, updateQuotationForUser } from "@/lib/services/quotation-service";
import type { Customer, Product, Quotation, QuotationItem, AppSettings, QuotationStatus } from "@/lib/data-types";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { useRouter, useParams } from "next/navigation";
import { CustomerSelectionDialog } from "@/components/shared/customer-selection-dialog";
import { ProductSelectionDialog } from "@/components/shared/product-selection-dialog";
import Link from "next/link";

interface QuotationFormItem extends QuotationItem {
  clientTempId: string; // For managing items in UI before saving
}

const quotationStatuses: QuotationStatus[] = ["Draft", "Sent", "Accepted", "Declined", "Expired"];

export default function EditQuotationPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth();
  const router = useRouter();
  const params = useParams();
  const quotationId = typeof params.id === 'string' ? params.id : null;

  const [originalQuotation, setOriginalQuotation] = useState<Quotation | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quotation Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [manualCustomerName, setManualCustomerName] = useState<string>("");
  const [quoteDate, setQuoteDate] = useState<Date | undefined>(new Date());
  const [validTillDate, setValidTillDate] = useState<Date | undefined>(addDays(new Date(), 30));
  const [currentStatus, setCurrentStatus] = useState<QuotationStatus>("Draft");
  const [items, setItems] = useState<QuotationFormItem[]>([]);
  const [overallDiscountAmount, setOverallDiscountAmount] = useState<string>("0");
  const [overallTaxAmount, setOverallTaxAmount] = useState<string>("0");
  const [shippingCharges, setShippingCharges] = useState<string>("0");
  const [extraCosts, setExtraCosts] = useState<string>("0");
  const [termsAndConditions, setTermsAndConditions] = useState<string>("");
  const [paymentMethods, setPaymentMethods] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Current Item Entry Fields
  const [currentItemName, setCurrentItemName] = useState<string>("");
  const [currentItemProductId, setCurrentItemProductId] = useState<string | undefined>(undefined);
  const [currentItemProductCode, setCurrentItemProductCode] = useState<string | undefined>(undefined);
  const [currentItemQuantity, setCurrentItemQuantity] = useState<string>("1");
  const [currentItemCostPrice, setCurrentItemCostPrice] = useState<string>("");
  const [currentItemSalePrice, setCurrentItemSalePrice] = useState<string>("");
  const [currentItemDiscountPercentage, setCurrentItemDiscountPercentage] = useState<string>("0");
  const [currentItemTaxPercentage, setCurrentItemTaxPercentage] = useState<string>("0");

  const [isCustomerSelectOpen, setIsCustomerSelectOpen] = useState(false);
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);

  const populateForm = useCallback((quote: Quotation) => {
    setOriginalQuotation(quote);
    setSelectedCustomerId(quote.customerId || "");
    setManualCustomerName(quote.customerId ? "" : quote.customerName);
    setQuoteDate(isValid(parseISO(quote.quoteDate)) ? parseISO(quote.quoteDate) : new Date());
    setValidTillDate(isValid(parseISO(quote.validTillDate)) ? parseISO(quote.validTillDate) : addDays(new Date(), 30));
    setCurrentStatus(quote.status);
    setItems(quote.items.map(item => ({ ...item, clientTempId: item.productId || `manual_${Math.random().toString(36).substr(2, 9)}` })));
    setOverallDiscountAmount(quote.overallDiscountAmount.toString());
    setOverallTaxAmount(quote.overallTaxAmount.toString());
    setShippingCharges(quote.shippingCharges.toString());
    setExtraCosts(quote.extraCosts.toString());
    setTermsAndConditions(quote.termsAndConditions || "");
    setPaymentMethods(quote.paymentMethods || "");
    setNotes(quote.notes || "");
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId || !quotationId) {
        setIsLoadingData(false);
        if (!quotationId) router.push("/quotations");
        return;
      }
      setIsLoadingData(true);
      try {
        const [loadedCustomers, loadedProducts, loadedQuotation] = await Promise.all([
          getCustomersForUser(userId),
          getProductsForUser(userId),
          getQuotationByIdForUser(userId, quotationId)
        ]);
        setCustomers(loadedCustomers.filter(c => c.id !== "CUST_WALK_IN"));
        setProducts(loadedProducts);
        if (loadedQuotation) {
          populateForm(loadedQuotation);
        } else {
          toast({ title: "Quotation Not Found", description: "The requested quotation could not be found.", variant: "destructive" });
          router.push("/quotations");
        }
      } catch (error) {
        console.error("Failed to load data for edit quotation page:", error);
        toast({ title: "Error Loading Data", description: "Could not load data for editing.", variant: "destructive" });
      } finally {
        setIsLoadingData(false);
      }
    };

    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
    }
  }, [authLoading, userId, appSettings, quotationId, router, toast, populateForm]);


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
      toast({ title: "Item Name Required", description: "Product/Service name is required.", variant: "destructive" });
      return;
    }
    const quantity = parseInt(currentItemQuantity, 10);
    const salePrice = parseFloat(currentItemSalePrice);
    const costPrice = parseFloat(currentItemCostPrice) || 0;
    const discountPercentage = parseFloat(currentItemDiscountPercentage) || 0;
    const taxPercentage = parseFloat(currentItemTaxPercentage) || 0;

    if (isNaN(quantity) || quantity <= 0) { toast({ title: "Invalid Quantity", description: "Valid quantity required.", variant: "destructive" }); return; }
    if (isNaN(salePrice) || salePrice <= 0) { toast({ title: "Invalid Sale Price", description: "Valid sale price required.", variant: "destructive" }); return; }
    if (isNaN(costPrice) || costPrice < 0) { toast({ title: "Invalid Cost Price", description: "Cost price must be non-negative.", variant: "destructive"}); return; }
    if (isNaN(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) { toast({ title: "Invalid Item Discount", description: "Item discount must be 0-100.", variant: "destructive" }); return; }
    if (isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) { toast({ title: "Invalid Item Tax", description: "Item tax must be 0-100.", variant: "destructive" }); return; }

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
      quantity, salePrice, costPrice, discountPercentage, taxPercentage,
      itemSubtotal, itemDiscountAmount, priceAfterItemDiscount, itemTaxAmount, itemTotal,
    };
    setItems(prev => [...prev, newItem]);
    setCurrentItemName(""); setCurrentItemProductId(undefined); setCurrentItemProductCode(undefined);
    setCurrentItemQuantity("1"); setCurrentItemSalePrice(""); setCurrentItemCostPrice("");
    setCurrentItemDiscountPercentage("0"); setCurrentItemTaxPercentage("0");
  };

  const handleRemoveItem = (clientTempId: string) => {
    setItems(prev => prev.filter(item => item.clientTempId !== clientTempId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !quotationId || !originalQuotation || !appSettings) {
      toast({ title: "Data Loading Error", description: "Required data not loaded. Cannot save.", variant: "destructive" });
      return;
    }
    
    const finalCustomerName = selectedCustomerId ? (customers.find(c => c.id === selectedCustomerId)?.name || "Unknown Customer") : manualCustomerName.trim();
    if (!finalCustomerName) { toast({ title: "Customer Name Required", description: "Please select or enter a customer name.", variant: "destructive" }); return; }
    if (!quoteDate || !validTillDate) { toast({ title: "Dates Required", description: "Quote Date and Valid Till Date are required.", variant: "destructive" }); return; }
    if (items.length === 0) { toast({ title: "Items Required", description: "Please add at least one item to the quotation.", variant: "destructive" }); return; }

    setIsSubmitting(true);

    const quotationUpdatePayload: Partial<Omit<Quotation, 'id' | 'numericQuotationId' | 'createdAt' | 'lastUpdatedAt'>> & { items: Array<Omit<QuotationItem, 'itemSubtotal' | 'itemDiscountAmount' | 'priceAfterItemDiscount'| 'itemTaxAmount' | 'itemTotal'>> } = {
      customerId: selectedCustomerId || undefined,
      customerName: finalCustomerName,
      quoteDate: quoteDate.toISOString(),
      validTillDate: validTillDate.toISOString(),
      status: currentStatus,
      items: items.map(({ clientTempId, itemSubtotal, itemDiscountAmount, priceAfterItemDiscount, itemTaxAmount, itemTotal, ...item}) => item),
      overallDiscountAmount: calculatedTotals.overallDiscount,
      overallTaxAmount: calculatedTotals.overallTax,
      shippingCharges: calculatedTotals.shipping,
      extraCosts: calculatedTotals.extraCosts,
      termsAndConditions: termsAndConditions.trim() || undefined,
      paymentMethods: paymentMethods.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    try {
      const { updatedQuotation, activityEntry } = await updateQuotationForUser(userId, quotationId, quotationUpdatePayload);
      toast({ title: "Quotation Updated", description: `Quotation #${updatedQuotation.numericQuotationId} for ${updatedQuotation.customerName} saved.` });
      populateForm(updatedQuotation); 
      router.push("/quotations");
    } catch (error: any) {
      toast({ title: "Error Updating Quotation", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomerDialogSelect = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setManualCustomerName(""); 
    setIsCustomerSelectOpen(false);
  };

  const handleProductDialogSelect = (product: Product) => {
    setCurrentItemName(product.name);
    setCurrentItemCostPrice((product.costPrice || 0).toString());
    setCurrentItemSalePrice(product.price.toString());
    setCurrentItemProductId(product.id);
    setCurrentItemProductCode(product.productCode);
    setIsProductSelectOpen(false);
  };

  if (isLoadingData || authLoading || !appSettings) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-3">Loading quotation data...</p></div>;
  }
  if (!user) { return <p className="text-center text-lg">Please log in.</p>; }
  if (!originalQuotation && !isLoadingData) { return <p className="text-center text-lg">Quotation not found or could not be loaded.</p>; }


  return (
    <div className="space-y-6">
      {appSettings && (
        <>
          <CustomerSelectionDialog isOpen={isCustomerSelectOpen} onOpenChange={setIsCustomerSelectOpen} customers={customers} onCustomerSelect={handleCustomerDialogSelect} />
          <ProductSelectionDialog isOpen={isProductSelectOpen} onOpenChange={setIsProductSelectOpen} products={products} appSettings={appSettings} onProductSelect={handleProductDialogSelect} context="checkout" />
        </>
      )}
      <Card className="shadow-md">
        <CardHeader className="flex flex-row justify-between items-center">
            <div>
                <CardTitle className="font-headline text-xl flex items-center"><EditIcon className="mr-2 h-5 w-5 text-primary"/>Edit Quotation #{originalQuotation?.numericQuotationId}</CardTitle>
                <CardDescription>Modify the details of the quotation.</CardDescription>
            </div>
            <Link href="/quotations" passHref>
                <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4"/> Back to List</Button>
            </Link>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center"><BookUser className="mr-2 h-5 w-5"/>Customer, Dates & Status</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-[2fr_auto] gap-2 items-end">
                    <div>
                        <Label htmlFor="customerSelect">Select Customer</Label>
                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} disabled={customers.length === 0 || isSubmitting}>
                        <SelectTrigger id="customerSelect"><SelectValue placeholder={customers.length === 0 ? "No customers" : "Select registered customer"} /></SelectTrigger>
                        <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <Button type="button" variant="outline" size="icon" onClick={() => setIsCustomerSelectOpen(true)} className="h-10 w-10" title="Search Customers" disabled={customers.length === 0 || isSubmitting}><Users className="h-5 w-5"/></Button>
                </div>
                 <div className="sm:col-span-2">
                    <Label htmlFor="manualCustomerName" className="mt-1">Or Enter Customer Name</Label>
                    <Input id="manualCustomerName" value={manualCustomerName} onChange={e => { setManualCustomerName(e.target.value); if (e.target.value) setSelectedCustomerId(""); }} placeholder="Manual Customer Name" disabled={isSubmitting} />
                </div>
                <div>
                  <Label htmlFor="quoteDate">Quote Date</Label>
                  <Popover><PopoverTrigger asChild><Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!quoteDate && "text-muted-foreground"}`} disabled={isSubmitting}><CalendarIcon className="mr-2 h-4 w-4" />{quoteDate ? format(quoteDate, "PPP") : <span>Pick date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={quoteDate} onSelect={setQuoteDate} initialFocus /></PopoverContent></Popover>
                </div>
                <div>
                  <Label htmlFor="validTillDate">Valid Till</Label>
                  <Popover><PopoverTrigger asChild><Button variant={"outline"} className={`w-full justify-start text-left font-normal ${!validTillDate && "text-muted-foreground"}`} disabled={isSubmitting}><CalendarIcon className="mr-2 h-4 w-4" />{validTillDate ? format(validTillDate, "PPP") : <span>Pick date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={validTillDate} onSelect={setValidTillDate} initialFocus /></PopoverContent></Popover>
                </div>
                 <div className="sm:col-span-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={currentStatus} onValueChange={(value: QuotationStatus) => setCurrentStatus(value)} disabled={isSubmitting}>
                        <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                        <SelectContent>{quotationStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center"><ListPlus className="mr-2 h-5 w-5"/>Quotation Items</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-end p-3 border rounded-md bg-muted/20">
                  <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 items-end">
                    <div className="flex-grow">
                        <Label htmlFor="itemName">Product / Service</Label>
                        <div className="flex items-center gap-2">
                            <Input id="itemName" value={currentItemName} onChange={e => setCurrentItemName(e.target.value)} placeholder="Item name or service" disabled={isSubmitting}/>
                            <Button type="button" variant="outline" size="icon" onClick={() => setIsProductSelectOpen(true)} className="h-10 w-10 flex-shrink-0" title="Select from Inventory" disabled={products.length === 0 || isSubmitting}><PackageSearch className="h-5 w-5"/></Button>
                        </div>
                    </div>
                    <div><Label htmlFor="itemQty">Quantity</Label><Input id="itemQty" type="number" value={currentItemQuantity} onChange={e => setCurrentItemQuantity(e.target.value)} min="1" className="text-center" disabled={isSubmitting}/></div>
                    <div><Label htmlFor="itemCostPrice">Cost Price</Label><Input id="itemCostPrice" type="number" value={currentItemCostPrice} onChange={e => setCurrentItemCostPrice(e.target.value)} step="0.01" min="0" placeholder="0.00" disabled={isSubmitting}/></div>
                    <div><Label htmlFor="itemSalePrice">Sale Price</Label><Input id="itemSalePrice" type="number" value={currentItemSalePrice} onChange={e => setCurrentItemSalePrice(e.target.value)} step="0.01" min="0.01" placeholder="0.00" disabled={isSubmitting}/></div>
                    <div><Label htmlFor="itemDisc" className="flex items-center"><Percent className="mr-1 h-3 w-3"/>Disc.</Label><Input id="itemDisc" type="number" value={currentItemDiscountPercentage} onChange={e => setCurrentItemDiscountPercentage(e.target.value)} step="0.01" min="0" max="100" placeholder="0" disabled={isSubmitting}/></div>
                    <div><Label htmlFor="itemTax" className="flex items-center"><Percent className="mr-1 h-3 w-3"/>Tax</Label><Input id="itemTax" type="number" value={currentItemTaxPercentage} onChange={e => setCurrentItemTaxPercentage(e.target.value)} step="0.01" min="0" max="100" placeholder="0" disabled={isSubmitting}/></div>
                  </div>
                  <Button type="button" onClick={handleAddItem} className="self-end h-10 md:mt-0 mt-3 w-full md:w-auto" disabled={isSubmitting}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
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
                  {isSubmitting ? "Saving Changes..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
