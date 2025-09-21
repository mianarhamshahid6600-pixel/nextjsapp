
"use client";

import { useState, useEffect, useMemo, type FormEvent, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, TrendingUp, TrendingDown, DollarSign, Coins, Loader2, Filter, ListOrdered, Wallet, ReceiptText, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, currencySymbols } from "@/lib/currency-utils";
import type { FinancialOverviewPeriod, BusinessTransaction, FinancialTransactionType, AppSettings } from "@/lib/data-types";
import { format, startOfMonth, endOfMonth, subDays, subMonths, startOfYear, endOfYear } from 'date-fns';
import { fetchBusinessTransactions, adjustBusinessCashBalanceForUser } from "@/lib/services/financial-service";
import { cn } from "@/lib/utils";


export default function FinancialOverviewPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, refreshAuthContext } = useAuth();

  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [allTransactionsForCalculation, setAllTransactionsForCalculation] = useState<BusinessTransaction[]>([]);
  const [calculatedTotalBusinessCash, setCalculatedTotalBusinessCash] = useState<number>(0);
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialOverviewPeriod>("this_month");

  const [isAdjustBalanceModalOpen, setIsAdjustBalanceModalOpen] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState<string>("");
  const [adjustmentType, setAdjustmentType] = useState<'credit' | 'debit'>("credit");
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>("");
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isTotalCashVisible, setIsTotalCashVisible] = useState(true);
  const [isTotalInflowVisible, setIsTotalInflowVisible] = useState(true);
  const [isTotalOutflowVisible, setIsTotalOutflowVisible] = useState(true);

  const [isNegativeCashConfirmOpen, setIsNegativeCashConfirmOpen] = useState(false);
  const [negativeCashDetails, setNegativeCashDetails] = useState<{ currentCash: number; debitAmount: number; newBalance: number } | null>(null);
  const proceedActionRef = useRef<(() => Promise<void>) | null>(null);


  const fetchTransactionsCallback = useCallback(async (period: FinancialOverviewPeriod) => {
    if (!userId) {
      setIsLoadingPageData(false);
      setTransactions([]);
      setAllTransactionsForCalculation([]);
      return;
    }
    setIsLoadingPageData(true);
    setError(null);
    try {
      let startDateFilter: Date | undefined;
      let endDateFilter: Date | undefined = new Date();
      let fetchForAllTimeForPeriodView = period === 'all_time';

      if (period === 'this_month') {
        startDateFilter = startOfMonth(endDateFilter);
        endDateFilter = endOfMonth(endDateFilter);
      } else if (period === 'last_month') {
        const lastMonthDate = subMonths(new Date(), 1);
        startDateFilter = startOfMonth(lastMonthDate);
        endDateFilter = endOfMonth(lastMonthDate);
      } else if (period === 'this_year') {
        startDateFilter = startOfYear(endDateFilter);
        endDateFilter = endOfYear(endDateFilter);
      } else if (period === 'all_time') {
        startDateFilter = undefined;
        endDateFilter = undefined;
      }

      const periodSpecificTransactions = await fetchBusinessTransactions(userId, startDateFilter, endDateFilter, fetchForAllTimeForPeriodView);
      setTransactions(periodSpecificTransactions);

      const allHistoricalTx = await fetchBusinessTransactions(userId, undefined, undefined, true);
      setAllTransactionsForCalculation(allHistoricalTx);

    } catch (err: any) {
      console.error("Error fetching transactions:", err);
      setError(err.message || "Failed to fetch transactions.");
      setTransactions([]);
      setAllTransactionsForCalculation([]);
    } finally {
      setIsLoadingPageData(false);
    }
  }, [userId]);


  useEffect(() => {
    if (!authLoading && appSettings && userId) {
      fetchTransactionsCallback(selectedPeriod);
    } else if (!authLoading && (!appSettings || !userId)) {
      setIsLoadingPageData(false);
      setTransactions([]);
      setAllTransactionsForCalculation([]);
    }
  }, [authLoading, appSettings, userId, selectedPeriod, fetchTransactionsCallback]);

  useEffect(() => {
    if (!allTransactionsForCalculation || allTransactionsForCalculation.length === 0) {
      setCalculatedTotalBusinessCash(0);
      return;
    }
    let totalInflow = 0;
    let totalOutflow = 0;
    allTransactionsForCalculation.forEach(tx => {
      if (tx.amount > 0) {
        totalInflow += tx.amount;
      } else if (tx.amount < 0) {
        totalOutflow += Math.abs(tx.amount);
      }
    });
    setCalculatedTotalBusinessCash(totalInflow - totalOutflow);
  }, [allTransactionsForCalculation]);


  const filteredTransactionsForPeriod = useMemo(() => {
    return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const cashFlowSummary = useMemo(() => {
    const inflow = filteredTransactionsForPeriod
      .filter(t => t.amount > 0 && t.type !== 'manual_adjustment_credit' && t.type !== 'initial_balance_set' && t.type !== 'stock_adjustment_credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const outflow = filteredTransactionsForPeriod
      .filter(t => t.amount < 0 && t.type !== 'manual_adjustment_debit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      totalInflow: inflow,
      totalOutflow: outflow,
    };
  }, [filteredTransactionsForPeriod]);

  const proceedWithBalanceAdjustment = async () => {
    setIsSubmittingAdjustment(true);
    try {
      const amountNum = parseFloat(adjustmentAmount); // Already validated before calling this
      const finalNotes = adjustmentNotes.trim() === "" ? "N/A" : adjustmentNotes.trim();
      await adjustBusinessCashBalanceForUser(userId!, amountNum, adjustmentType, finalNotes);

      toast({ title: "Balance Adjusted", description: `Cash balance has been ${adjustmentType === 'credit' ? 'increased' : 'decreased'} by ${formatCurrency(amountNum, appSettings.currency, currencyForConversionSource)}.`, variant: "default" });
      
      await refreshAuthContext(true); // Refresh all, including appSettings for business cash
      fetchTransactionsCallback(selectedPeriod);

      setIsAdjustBalanceModalOpen(false);
      setAdjustmentAmount("");
      setAdjustmentNotes("");
      setAdjustmentType("credit");
    } catch (err: any) {
      console.error("Error adjusting balance:", err);
      toast({ title: "Error Adjusting Balance", description: err.message || "Failed to adjust balance. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmittingAdjustment(false);
      proceedActionRef.current = null;
    }
  };

  const handleAdjustBalanceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Error", description: "User not logged in or settings not loaded.", variant: "destructive" });
      return;
    }
    const amountNum = parseFloat(adjustmentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid positive amount.", variant: "destructive" });
      return;
    }

    if (adjustmentType === 'debit') {
      const currentCash = appSettings.currentBusinessCash;
      const potentialNewCash = currentCash - amountNum;
      if (potentialNewCash < 0) {
        setNegativeCashDetails({
          currentCash: currentCash,
          debitAmount: amountNum,
          newBalance: potentialNewCash
        });
        proceedActionRef.current = proceedWithBalanceAdjustment;
        setIsNegativeCashConfirmOpen(true);
        return;
      }
    }
    await proceedWithBalanceAdjustment();
  };

 const formatDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "PPp");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const getTransactionTypeDisplay = (type: FinancialTransactionType): string => {
    switch(type) {
      case 'sale_income': return 'Sale Income';
      case 'purchase_payment': return 'Purchase/Stock Payment';
      case 'manual_adjustment_credit': return 'Manual Credit Adj.';
      case 'manual_adjustment_debit': return 'Manual Debit Adj.';
      case 'supplier_payment': return 'Supplier Payment';
      case 'other_expense': return 'Other Expense';
      case 'other_income': return 'Other Income';
      case 'initial_balance_set': return 'Initial Balance Set';
      case 'sale_return': return 'Sale Return';
      case 'stock_adjustment_credit': return 'Stock Adjustment (Credit)';
      default: return type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }


  if (authLoading || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading financial overview...</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to view financial overview.</p>;
  }

  if (error && !isLoadingPageData && transactions.length === 0 && allTransactionsForCalculation.length === 0) {
    return <p className="text-center text-lg text-destructive">Error: {error}</p>;
  }
  
  const obfuscationChar = appSettings.obfuscationCharacter || '*';

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
              This adjustment will result in a negative total business cash balance.
              <ul className="mt-2 list-disc list-inside text-sm">
                <li>Current Cash: {formatCurrency(negativeCashDetails?.currentCash || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li>Debit Amount: {formatCurrency(negativeCashDetails?.debitAmount || 0, appSettings.currency, currencyForConversionSource)}</li>
                <li className="font-semibold">Potential New Balance: {formatCurrency(negativeCashDetails?.newBalance || 0, appSettings.currency, currencyForConversionSource)}</li>
              </ul>
              Do you want to proceed with this adjustment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => proceedActionRef.current = null} disabled={isSubmittingAdjustment}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (proceedActionRef.current) {
                  await proceedActionRef.current();
                }
              }}
              disabled={isSubmittingAdjustment}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmittingAdjustment ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="shadow-lg border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-headline flex items-center text-primary">
              <Wallet className="mr-3 h-7 w-7" /> Total Business Cash
            </CardTitle>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsTotalCashVisible(!isTotalCashVisible)}
                className="h-9 w-9"
                title={isTotalCashVisible ? "Hide amount" : "Show amount"}
                disabled={isLoadingPageData}
            >
                {isTotalCashVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
          </div>
           <CardDescription>Calculated total cash based on all recorded transactions.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-4">
           <div className="relative h-10 min-w-[200px]">
              {isLoadingPageData ? (
                 <span className="absolute inset-0 flex items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                 </span>
              ) : (
                <>
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center text-3xl font-bold text-foreground transition-opacity duration-300 ease-in-out",
                      isTotalCashVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                  >
                    {formatCurrency(calculatedTotalBusinessCash, appSettings.currency, currencyForConversionSource)}
                  </span>
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center text-3xl font-bold text-foreground transition-opacity duration-300 ease-in-out",
                      !isTotalCashVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                  >
                    {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                  </span>
                </>
              )}
            </div>
            <Button onClick={() => setIsAdjustBalanceModalOpen(true)} variant="outline" disabled={isLoadingPageData}>
                <Coins className="mr-2 h-4 w-4" /> Adjust Balance
            </Button>
        </CardContent>
      </Card>

      <Dialog open={isAdjustBalanceModalOpen} onOpenChange={setIsAdjustBalanceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center"><Coins className="mr-2 h-5 w-5 text-primary"/>Adjust Business Cash Balance</DialogTitle>
            <DialogDescription>Manually credit or debit your business cash balance. This will also create a transaction log entry.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjustBalanceSubmit} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="adjustmentType">Adjustment Type</Label>
              <Select value={adjustmentType} onValueChange={(value: 'credit' | 'debit') => setAdjustmentType(value)} disabled={isSubmittingAdjustment}>
                <SelectTrigger id="adjustmentType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (Add to Balance)</SelectItem>
                  <SelectItem value="debit">Debit (Subtract from Balance)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="adjustmentAmount">Amount ({appSettings.currency})</Label>
              <Input id="adjustmentAmount" type="number" value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)} placeholder="0.00" step="0.01" min="0.01" required disabled={isSubmittingAdjustment}/>
            </div>
            <div>
              <Label htmlFor="adjustmentNotes">Notes (Optional)</Label>
              <Textarea id="adjustmentNotes" value={adjustmentNotes} onChange={e => setAdjustmentNotes(e.target.value)} placeholder="Reason for adjustment, e.g., Owner investment, Petty cash withdrawal" disabled={isSubmittingAdjustment}/>
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingAdjustment}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSubmittingAdjustment}>
                {isSubmittingAdjustment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmittingAdjustment ? "Processing..." : "Confirm Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="shadow-md">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="font-headline text-xl flex items-center"><Filter className="mr-2 h-5 w-5 text-primary"/>Operational Cash Flow (Period Specific)</CardTitle>
              <CardDescription>Overview of operational cash movements for the selected period (excludes manual balance adjustments).</CardDescription>
            </div>
            <Select value={selectedPeriod} onValueChange={(value: FinancialOverviewPeriod) => setSelectedPeriod(value)} disabled={isLoadingPageData}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Card className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">Total Operational Inflow (Period)</CardTitle>
              <div className="flex items-center">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsTotalInflowVisible(!isTotalInflowVisible)}
                    className="h-6 w-6 mr-1 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800"
                    title={isTotalInflowVisible ? "Hide amount" : "Show amount"}
                    disabled={isLoadingPageData}
                >
                    {isTotalInflowVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative h-8 min-w-[100px]">
                 {isLoadingPageData ? (
                    <span className="absolute inset-0 flex items-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center text-2xl font-bold text-green-700 dark:text-green-300 transition-opacity duration-300 ease-in-out",
                          isTotalInflowVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        {formatCurrency(cashFlowSummary.totalInflow, appSettings.currency, currencyForConversionSource)}
                      </span>
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center text-xl font-bold text-green-700 dark:text-green-300 transition-opacity duration-300 ease-in-out",
                          !isTotalInflowVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                      </span>
                    </>
                  )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300">Total Operational Outflow (Period)</CardTitle>
               <div className="flex items-center">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsTotalOutflowVisible(!isTotalOutflowVisible)}
                    className="h-6 w-6 mr-1 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-800"
                    title={isTotalOutflowVisible ? "Hide amount" : "Show amount"}
                    disabled={isLoadingPageData}
                >
                    {isTotalOutflowVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative h-8 min-w-[100px]">
                 {isLoadingPageData ? (
                    <span className="absolute inset-0 flex items-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center text-2xl font-bold text-red-700 dark:text-red-300 transition-opacity duration-300 ease-in-out",
                          isTotalOutflowVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        {formatCurrency(cashFlowSummary.totalOutflow, appSettings.currency, currencyForConversionSource)}
                      </span>
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center text-xl font-bold text-red-700 dark:text-red-300 transition-opacity duration-300 ease-in-out",
                          !isTotalOutflowVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                         {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                      </span>
                    </>
                  )}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center"><ReceiptText className="mr-2 h-5 w-5 text-primary"/>Business Transaction Log (Period: {selectedPeriod.replace('_', ' ').toUpperCase()})</CardTitle>
          <CardDescription>Detailed list of financial transactions affecting business cash for the selected period.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[60vh] overflow-y-auto">
        {isLoadingPageData && transactions.length === 0 && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {!isLoadingPageData && (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount ({appSettings.currency})</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactionsForPeriod.length > 0 ? (
                  filteredTransactionsForPeriod.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell className="max-w-[250px] truncate hover:whitespace-normal">{tx.description}</TableCell>
                      <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                              tx.amount > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                              tx.amount < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                              {getTransactionTypeDisplay(tx.type)}
                          </span>
                      </TableCell>
                      <TableCell className={`text-right font-medium whitespace-nowrap ${tx.amount > 0 ? 'text-green-600 dark:text-green-400' : tx.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                        {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount, appSettings.currency, currencyForConversionSource)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[150px] hover:whitespace-normal">{tx.notes || "N/A"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                       {transactions.length === 0 && !isLoadingPageData ? "No transactions recorded yet for this period." : 
                        (isLoadingPageData ? "Loading transactions..." : "No transactions match the current filter.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
