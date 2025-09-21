
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Search, FilterX, CalendarDays, UserCircle, DollarSignIcon, HashIcon, Banknote, FileText } from "lucide-react";
import { fetchBusinessTransactions } from "@/lib/services/financial-service";
import { getSuppliersForUser } from "@/lib/services/supplier-service";
import type { BusinessTransaction, Supplier, DashboardPeriod } from "@/lib/data-types";
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";

type DateRangeFilter = DashboardPeriod;

export default function SupplierPaymentsListPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth();

  const [allTransactions, setAllTransactions] = useState<BusinessTransaction[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeFilter>("all_time");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");

  const fetchData = useCallback(async () => {
    if (!userId || !appSettings) {
      setIsLoadingData(false);
      setAllTransactions([]);
      setSuppliers([]);
      return;
    }
    setIsLoadingData(true);
    try {
      // For date range filtering, fetchBusinessTransactions already supports it.
      // We fetch all for 'all_time' and let the service handle date filtering if period is specified.
      const [loadedTransactions, loadedSuppliers] = await Promise.all([
        fetchBusinessTransactions(userId, undefined, undefined, selectedDateRange === 'all_time'), // Pass allTime flag
        getSuppliersForUser(userId),
      ]);
      setAllTransactions(loadedTransactions);
      setSuppliers(loadedSuppliers);
    } catch (error: any) {
      console.error("Failed to load data for supplier payments page:", error);
      toast({ title: "Error", description: "Could not load payments or supplier data.", variant: "destructive" });
      setAllTransactions([]);
      setSuppliers([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, appSettings, toast, selectedDateRange]);

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
      setAllTransactions([]);
      setSuppliers([]);
    }
  }, [authLoading, userId, appSettings, fetchData]);

  const supplierPayments = useMemo(() => {
    let payments = allTransactions.filter(tx => tx.type === 'supplier_payment');
    
    if (selectedDateRange !== "all_time") {
        const now = new Date();
        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (selectedDateRange === "this_month") {
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
        } else if (selectedDateRange === "last_month") {
            const lastMonthDate = subMonths(now, 1);
            startDate = startOfMonth(lastMonthDate);
            endDate = endOfMonth(lastMonthDate);
        } else if (selectedDateRange === "this_year") {
            startDate = startOfYear(now);
            endDate = endOfYear(now);
        }
        if(startDate && endDate) {
            payments = payments.filter(p => {
                const paymentDate = new Date(p.date);
                return paymentDate >= startDate! && paymentDate <= endDate!;
            });
        }
    }
    
    if (selectedSupplierId !== "all") {
      payments = payments.filter(payment => payment.relatedDocumentId === selectedSupplierId);
    }
    
    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      const supplierMap = new Map(suppliers.map(s => [s.id, s.name || s.companyName || "Unknown"]));
      payments = payments.filter(payment => {
        const supplierName = payment.relatedDocumentId ? supplierMap.get(payment.relatedDocumentId) : "Unknown";
        return (
          (payment.id && payment.id.toLowerCase().includes(lowerSearchTerm)) ||
          (supplierName && supplierName.toLowerCase().includes(lowerSearchTerm)) ||
          (payment.description && payment.description.toLowerCase().includes(lowerSearchTerm)) ||
          (payment.notes && payment.notes.toLowerCase().includes(lowerSearchTerm)) ||
          Math.abs(payment.amount).toString().includes(lowerSearchTerm)
        );
      });
    }
    return payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, searchTerm, selectedSupplierId, selectedDateRange, suppliers]);

  const getSupplierName = (supplierId?: string): string => {
    if (!supplierId) return "N/A";
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? (supplier.name || supplier.companyName || "Unknown Supplier") : "Unknown Supplier";
  };

  const extractPaymentMethod = (description: string): string => {
    const match = description.match(/Method: ([\w\s]+)(\.|$)/);
    return match ? match[1].trim() : "N/A";
  };
  
  const extractReference = (description: string): string => {
      const match = description.match(/Ref: ([\w\s-]+)(\.|$)/);
      return match ? match[1].trim() : "N/A";
  }

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedDateRange("all_time");
    setSelectedSupplierId("all");
  };

  const formatPaymentDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "PPp"); 
    } catch (e) {
      return "Invalid Date";
    }
  };
  
  const hasActiveFilters = searchTerm.trim() !== "" || selectedDateRange !== "all_time" || selectedSupplierId !== "all";

  if (authLoading || isLoadingData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading supplier payments...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to view supplier payments.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <Banknote className="mr-2 h-5 w-5 text-primary" /> Supplier Payments List
          </CardTitle>
          <CardDescription>View, search, and filter payments made to suppliers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div className="lg:col-span-1">
              <Label htmlFor="searchPayments" className="mb-1 block">Search (ID, Supplier, Desc, Notes, Amount)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="searchPayments"
                  placeholder="E.g., #12, Supplier X, Payment for INV-001"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
             <div>
              <Label htmlFor="supplierFilter" className="mb-1 block">Supplier</Label>
              <Select 
                value={selectedSupplierId} 
                onValueChange={setSelectedSupplierId} 
                disabled={suppliers.length === 0}
              >
                <SelectTrigger id="supplierFilter">
                  <SelectValue placeholder={suppliers.length === 0 ? "No suppliers" : "Select supplier"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name || supplier.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dateRangeFilter" className="mb-1 block">Date Range</Label>
              <Select value={selectedDateRange} onValueChange={(value: DateRangeFilter) => setSelectedDateRange(value)}>
                <SelectTrigger id="dateRangeFilter">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-2">
              <FilterX className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
            <CardTitle className="text-lg">Payment Records</CardTitle>
            <CardDescription>
              Showing {supplierPayments.length} of {allTransactions.filter(tx => tx.type === 'supplier_payment').length} total supplier payments for the selected period.
            </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[150px]"><CalendarDays className="inline mr-1 h-4 w-4 text-muted-foreground"/>Date</TableHead>
                <TableHead><UserCircle className="inline mr-1 h-4 w-4 text-muted-foreground"/>Supplier</TableHead>
                <TableHead className="text-right w-[120px]"><DollarSignIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Amount</TableHead>
                <TableHead className="w-[120px]">Method</TableHead>
                <TableHead className="w-[150px]">Reference</TableHead>
                <TableHead className="min-w-[200px]"><FileText className="inline mr-1 h-4 w-4 text-muted-foreground"/>Notes/Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPayments.length > 0 ? (
                supplierPayments.map((payment) => (
                  <TableRow key={payment.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-sm whitespace-nowrap">{formatPaymentDate(payment.date)}</TableCell>
                    <TableCell>{getSupplierName(payment.relatedDocumentId)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(Math.abs(payment.amount), appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell>{extractPaymentMethod(payment.description)}</TableCell>
                    <TableCell>{extractReference(payment.description)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[250px] hover:max-w-none hover:whitespace-normal">{payment.notes || "N/A"}</TableCell>
                  </TableRow>
                ))
              ) : (
                 <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                        {allTransactions.filter(tx => tx.type === 'supplier_payment').length === 0 && !isLoadingData ? "No supplier payments recorded yet." : 
                         (isLoadingData ? "Loading payments..." : "No payments match current filters for this period.")}
                    </TableCell>
                  </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
