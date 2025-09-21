
"use client";

import { useState, type FormEvent, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Banknote, UserCircle, FileText, DollarSign, Edit, Save, Loader2, Info, HandCoins, ReceiptText, AlertTriangle, ListOrdered } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { getSuppliersForUser, recordPaymentToSupplier, getSupplierByIdForUser } from "@/lib/services/supplier-service";
import { getOpenPurchaseInvoicesForSupplier } from "@/lib/services/purchase-service";
import type { Supplier, AppSettings, PurchaseInvoice } from "@/lib/data-types";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { useRouter } from "next/navigation";

const commonPaymentMethods = ["Cash", "Bank Transfer", "Cheque", "Online Payment", "Other"];

export default function RecordSupplierPaymentPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, refreshAuthContext } = useAuth();
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [openInvoices, setOpenInvoices] = useState<PurchaseInvoice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(commonPaymentMethods[0]);
  const [reference, setReference] = useState<string>("");
  const [paymentTransactionId, setPaymentTransactionId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [isNegativeCashConfirmOpen, setIsNegativeCashConfirmOpen] = useState(false);
  const [negativeCashDetails, setNegativeCashDetails] = useState<{ currentCash: number; debitAmount: number; newBalance: number } | null>(null);
  const proceedActionRef = useRef<(() => Promise<void>) | null>(null);


  const fetchData = useCallback(async () => {
    if (!userId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      const loadedSuppliers = await getSuppliersForUser(userId);
      setSuppliers(loadedSuppliers);
      if (loadedSuppliers.length > 0 && !selectedSupplierId) {
        // Optionally pre-select first supplier or leave empty
      }
    } catch (error) {
      console.error("Failed to load suppliers for payment page:", error);
      toast({ title: "Error Loading Data", description: "Could not load suppliers.", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, toast, selectedSupplierId]);

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
    }
  }, [authLoading, userId, appSettings, fetchData]);

  useEffect(() => {
    const fetchSupplierAndInvoiceDetails = async () => {
      if (selectedSupplierId && userId) {
        setIsLoadingData(true);
        setIsLoadingInvoices(true);
        try {
          const [supplier, invoices] = await Promise.all([
            getSupplierByIdForUser(userId, selectedSupplierId),
            getOpenPurchaseInvoicesForSupplier(userId, selectedSupplierId)
          ]);
          setSelectedSupplier(supplier || null);
          setOpenInvoices(invoices);
        } catch (error) {
          toast({ title: "Error", description: "Could not fetch supplier or invoice details.", variant: "destructive"});
          setSelectedSupplier(null);
          setOpenInvoices([]);
        } finally {
          setIsLoadingData(false);
          setIsLoadingInvoices(false);
        }
      } else {
        setSelectedSupplier(null);
        setOpenInvoices([]);
      }
    };
    fetchSupplierAndInvoiceDetails();
  }, [selectedSupplierId, userId, toast]);


  const resetForm = () => {
    setSelectedSupplierId("");
    setSelectedSupplier(null);
    setOpenInvoices([]);
    setPaymentDate(new Date());
    setAmountPaid("");
    setSelectedPaymentMethod(commonPaymentMethods[0]);
    setReference("");
    setPaymentTransactionId("");
    setNotes("");
  };

  const proceedWithPaymentSubmission = async () => {
    setIsSubmitting(true);
    try {
      const numAmountPaid = parseFloat(amountPaid); // Already validated before calling this
      await recordPaymentToSupplier(
        userId!,
        selectedSupplierId,
        numAmountPaid,
        paymentDate!,
        selectedPaymentMethod,
        reference.trim() || undefined,
        paymentTransactionId.trim() || undefined,
        notes.trim() || undefined
      );
      toast({
        title: "Payment Recorded",
        description: `Payment of ${formatCurrency(numAmountPaid, appSettings.currency, currencyForConversionSource)} to ${selectedSupplier?.name || selectedSupplier?.companyName} saved. Invoice statuses updated.`,
      });
      await refreshAuthContext(true);
      resetForm();
    } catch (error: any) {
      toast({ title: "Error Recording Payment", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      proceedActionRef.current = null;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Error", description: "User or app settings not loaded.", variant: "destructive" });
      return;
    }
    if (!selectedSupplierId) {
      toast({ title: "Supplier Required", description: "Please select a supplier.", variant: "destructive" });
      return;
    }
    const numAmountPaid = parseFloat(amountPaid);
    if (isNaN(numAmountPaid) || numAmountPaid <= 0) {
      toast({ title: "Invalid Amount", description: "Amount paid must be a positive number.", variant: "destructive" });
      return;
    }
    if (!paymentDate) {
      toast({ title: "Payment Date Required", description: "Please select a payment date.", variant: "destructive" });
      return;
    }
     if (!selectedPaymentMethod) {
      toast({ title: "Payment Method Required", description: "Please select a payment method.", variant: "destructive" });
      return;
    }

    const currentCash = appSettings.currentBusinessCash;
    const potentialNewCash = currentCash - numAmountPaid;

    if (numAmountPaid > 0 && potentialNewCash < 0) {
      setNegativeCashDetails({
        currentCash: currentCash,
        debitAmount: numAmountPaid,
        newBalance: potentialNewCash
      });
      proceedActionRef.current = proceedWithPaymentSubmission;
      setIsNegativeCashConfirmOpen(true);
      return;
    }
    
    await proceedWithPaymentSubmission();
  };
  
  const getInvoiceAmountDue = (invoice: PurchaseInvoice) => {
    return Math.max(0, invoice.grandTotal - invoice.amountPaid);
  };

  if (authLoading || !appSettings) { 
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading page...</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to record supplier payments.</p>;
  }

  return (
    <div className="space-y-6">
       <AlertDialog open={isNegativeCashConfirmOpen} onOpenChange={(open) => {
        if (!open) proceedActionRef.current = null;
        setIsNegativeCashConfirmOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Cash Balance Warning</AlertDialogTitle>
            <AlertDialogDescription>
              This payment will result in a negative total business cash balance.
              <ul className="mt-2 list-disc list-inside text-sm">
                <li>Current Cash: {formatCurrency(negativeCashDetails?.currentCash || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li>Payment Amount: {formatCurrency(negativeCashDetails?.debitAmount || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li className="font-semibold">Potential New Balance: {formatCurrency(negativeCashDetails?.newBalance || 0, appSettings.currency, currencyForConversionSource)}</li>
              </ul>
              Do you want to proceed with this payment?
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

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center"><HandCoins className="mr-3 h-6 w-6 text-primary"/>Record Supplier Payment</CardTitle>
          <CardDescription className="text-sm">
            Record payments to suppliers. This will update their outstanding balance, your business cash, and the status of any relevant purchase invoices.
          </CardDescription>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supplier">Supplier <span className="text-destructive">*</span></Label>
                  <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId} disabled={suppliers.length === 0 || isSubmitting || isLoadingData}>
                    <SelectTrigger id="supplier">
                      <SelectValue placeholder={isLoadingData ? "Loading suppliers..." : (suppliers.length === 0 ? "No suppliers available" : "Select a supplier")} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name || s.companyName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedSupplier && (
                     <p className="text-xs text-muted-foreground mt-1">
                        Current Balance: <span className={`font-medium ${selectedSupplier.currentBalance > 0 ? 'text-destructive' : selectedSupplier.currentBalance < 0 ? 'text-green-600' : ''}`}>
                            {formatCurrency(selectedSupplier.currentBalance, appSettings.currency, currencyForConversionSource)}
                            {selectedSupplier.currentBalance !== 0 ? (selectedSupplier.currentBalance > 0 ? " (You Owe)" : " (Owes You)") : " (Settled)"}
                        </span>
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="paymentDate">Payment Date <span className="text-destructive">*</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={`w-full justify-start text-left font-normal ${!paymentDate && "text-muted-foreground"}`}
                        disabled={isSubmitting}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {paymentDate ? format(paymentDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="amountPaid">Amount Paid ({appSettings.currency}) <span className="text-destructive">*</span></Label>
                  <Input 
                    id="amountPaid" 
                    type="number" 
                    value={amountPaid} 
                    onChange={e => setAmountPaid(e.target.value)} 
                    placeholder="0.00" 
                    step="0.01" min="0.01" 
                    required 
                    disabled={isSubmitting || !selectedSupplierId}
                  />
                </div>
                <div>
                  <Label htmlFor="paymentMethod">Payment Method <span className="text-destructive">*</span></Label>
                  <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod} disabled={isSubmitting}>
                    <SelectTrigger id="paymentMethod"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {commonPaymentMethods.map(method => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="reference">Reference (e.g., Invoice # Paid, Purpose)</Label>
                  <Input id="reference" value={reference} onChange={e => setReference(e.target.value)} placeholder="INV-123, Advance Payment" disabled={isSubmitting}/>
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="paymentTransactionId">Payment Transaction ID</Label>
                  <Input id="paymentTransactionId" value={paymentTransactionId} onChange={e => setPaymentTransactionId(e.target.value)} placeholder="Bank Txn ID, Cheque No." disabled={isSubmitting}/>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional details about this payment..." rows={3} disabled={isSubmitting}/>
                </div>
              </CardContent>
            </Card>

            {selectedSupplierId && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center"><ListOrdered className="mr-2 h-5 w-5"/>Outstanding Invoices</CardTitle>
                        <CardDescription>
                            This payment will be automatically applied to the oldest outstanding invoices first.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingInvoices ? (
                             <div className="flex h-24 items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <p className="ml-3">Loading invoices...</p>
                            </div>
                        ) : openInvoices.length > 0 ? (
                            <div className="max-h-60 overflow-y-auto border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Inv #</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead className="text-right">Amount Due</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {openInvoices.map(invoice => (
                                            <TableRow key={invoice.id}>
                                                <TableCell>#{invoice.numericPurchaseId}</TableCell>
                                                <TableCell>{format(new Date(invoice.invoiceDate), "PP")}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(invoice.grandTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                                                <TableCell className="text-right font-medium text-destructive">{formatCurrency(getInvoiceAmountDue(invoice), appSettings.currency, currencyForConversionSource)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">No outstanding invoices for this supplier.</p>
                        )}
                    </CardContent>
                </Card>
            )}

          </div>

          <div className="lg:col-span-1 space-y-6">
             <Card className="sticky top-20">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center"><Info className="mr-2 h-5 w-5"/>Important Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p><strong className="text-foreground">Payment Application:</strong> This payment will automatically clear amounts due on the oldest purchase invoices for the selected supplier.</p>
                    <p><strong className="text-foreground">Financial Impact:</strong> The payment amount will be deducted from your 'Total Business Cash' and will reduce the supplier's outstanding balance (Accounts Payable).</p>
                </CardContent>
            </Card>
            <Button type="submit" className="w-full text-lg py-3 h-auto" disabled={isSubmitting || !selectedSupplierId || !amountPaid || isLoadingData || isLoadingInvoices}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
              {isSubmitting ? "Processing..." : "Record Payment"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

