

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Search, FilterX, ClipboardList, CalendarDays, UserCircleIcon, DollarSignIcon, HashIcon, PackageIcon, ReceiptText, ShoppingBag, Edit } from "lucide-react";
import type { PurchaseInvoice, Supplier, DashboardPeriod } from "@/lib/data-types";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { useRouter } from 'next/navigation';

type DateRangeFilter = DashboardPeriod;

export default function PurchaseInvoicesListPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, coreAppData } = useAuth();
  const router = useRouter();

  const { purchaseInvoices, suppliers } = coreAppData;
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeFilter>("all_time");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");

  const filteredAndSearchedInvoices = useMemo(() => {
    let filtered = [...purchaseInvoices]; 

    if (selectedDateRange !== "all_time") {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;
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
      filtered = filtered.filter(inv => {
          const invDate = new Date(inv.invoiceDate);
          return invDate >= startDate && invDate <= endDate;
      });
    }

    if (selectedSupplierId !== "all") {
      filtered = filtered.filter(invoice => invoice.supplierId === selectedSupplierId);
    }
    
    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(invoice => 
        invoice.numericPurchaseId.toString().includes(lowerSearchTerm) ||
        invoice.invoiceNumber.toLowerCase().includes(lowerSearchTerm) ||
        invoice.supplierName.toLowerCase().includes(lowerSearchTerm) ||
        invoice.items.some(item => item.productName.toLowerCase().includes(lowerSearchTerm))
      );
    }

    return filtered.sort((a, b) => b.numericPurchaseId - a.numericPurchaseId);
  }, [purchaseInvoices, searchTerm, selectedSupplierId, selectedDateRange]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedDateRange("all_time");
    setSelectedSupplierId("all");
  };

  const formatInvoiceDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "PP"); 
    } catch (e) {
      return "Invalid Date";
    }
  };
  
  const hasActiveFilters = searchTerm.trim() !== "" || selectedDateRange !== "all_time" || selectedSupplierId !== "all";

  const getItemNamesDisplay = (invoice: PurchaseInvoice): string => {
    if (invoice.items && invoice.items.length > 0) {
      return invoice.items.map(item => `${item.productName} (x${item.quantity} @ ${formatCurrency(item.purchasePrice, appSettings.currency, currencyForConversionSource)}/unit)`).join(", ");
    }
    return "N/A";
  };

  if (authLoading || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading purchase invoices...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to view purchase invoices.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <ReceiptText className="mr-2 h-5 w-5 text-primary" /> Purchase Invoices
          </CardTitle>
          <CardDescription>View, search, and filter your purchase history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div className="lg:col-span-1">
              <Label htmlFor="searchInvoices" className="mb-1 block">Search (ID, Inv#, Supplier, Items)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="searchInvoices"
                  placeholder="E.g., #12, INV-001, Supplier X, Paracetamol"
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
            <CardTitle className="text-lg">Invoice List</CardTitle>
            <CardDescription>
              Showing {filteredAndSearchedInvoices.length} of {purchaseInvoices.length} total purchase invoices.
            </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[80px]"><HashIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>ID</TableHead>
                <TableHead><UserCircleIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Supplier</TableHead>
                <TableHead>Supp. Inv #</TableHead>
                <TableHead><CalendarDays className="inline mr-1 h-4 w-4 text-muted-foreground"/>Date</TableHead>
                <TableHead className="min-w-[250px]"><ShoppingBag className="inline mr-1 h-4 w-4 text-muted-foreground"/>Items</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSearchedInvoices.length > 0 ? (
                filteredAndSearchedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">#{invoice.numericPurchaseId}</TableCell>
                    <TableCell>{invoice.supplierName}</TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{formatInvoiceDate(invoice.invoiceDate)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[250px] hover:max-w-none hover:whitespace-normal">
                      {getItemNamesDisplay(invoice)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(invoice.grandTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(invoice.amountPaid, appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell className={`text-right font-medium ${
                        invoice.paymentStatus === 'paid' ? 'text-green-600' :
                        invoice.paymentStatus === 'partially_paid' ? 'text-orange-500' :
                        'text-red-600'
                      }`}>
                        {invoice.paymentStatus.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/purchases/add?edit=${invoice.id}`)}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit Invoice</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                 <TableRow>
                    <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                        {purchaseInvoices.length === 0 ? "No purchase invoices found." : 
                         "No purchase invoices match current filters."}
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
