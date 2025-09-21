

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Search, FilterX, ClipboardList, CalendarDays, UserCircleIcon, DollarSignIcon, HashIcon, PackageIcon, Zap, RotateCcw, Building, ScanLine, PackageCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Sale, Customer, Return as ReturnType, SaleItem as DTSaleItem, DashboardPeriod } from "@/lib/data-types"; 
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";

type DateRangeFilter = DashboardPeriod;

export default function OrdersPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, coreAppData } = useAuth(); 

  const { sales, customers, returns: allReturns } = coreAppData;
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeFilter>("all_time");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all"); 
  const [selectedSaleType, setSelectedSaleType] = useState<"all" | "REGULAR" | "INSTANT">("all");

  const getSaleReturnStatus = useCallback((sale: Sale): { status: string; icon?: React.ElementType; color?: string } => {
    const relevantReturns = allReturns.filter(r => r.originalSaleId === sale.id);
    if (relevantReturns.length === 0) return { status: "No", icon: undefined };

    const soldItemsMap = new Map<string, number>();
    let totalInventoriedQuantitySold = 0;
    sale.items.forEach(item => {
        if (item.productId !== "MANUAL_ENTRY") {
            soldItemsMap.set(item.productId, (soldItemsMap.get(item.productId) || 0) + item.quantity);
            totalInventoriedQuantitySold += item.quantity;
        }
    });

    if (totalInventoriedQuantitySold === 0) {
        return { status: "N/A", icon: AlertTriangle, color: "text-gray-500" };
    }

    const returnedItemsMap = new Map<string, number>();
    relevantReturns.forEach(ret => {
        ret.items.forEach(item => {
            if (item.productId && item.productId !== "MANUAL_ENTRY") {
                returnedItemsMap.set(item.productId, (returnedItemsMap.get(item.productId) || 0) + item.quantityReturned);
            }
        });
    });
    
    if (returnedItemsMap.size === 0 && totalInventoriedQuantitySold > 0) return { status: "No", icon: undefined };

    let allItemsFullyReturned = true;
    let anyItemReturned = false;

    for (const [productId, qtySold] of soldItemsMap.entries()) {
        const qtyReturned = returnedItemsMap.get(productId) || 0;
        if (qtyReturned > 0) anyItemReturned = true;
        if (qtyReturned < qtySold) {
            allItemsFullyReturned = false;
        }
    }

    if (allItemsFullyReturned) return { status: "Yes", icon: CheckCircle2, color: "text-green-600" };
    if (anyItemReturned) return { status: "Partial", icon: PackageCheck, color: "text-orange-500" };
    
    return { status: "No", icon: undefined };
  }, [allReturns]);


  const filteredAndSearchedSales = useMemo(() => {
    let filtered = [...sales];

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
      filtered = filtered.filter(sale => {
          const saleDate = new Date(sale.saleDate);
          return saleDate >= startDate && saleDate <= endDate;
      });
    }

    if (selectedSaleType !== "all") {
      filtered = filtered.filter(sale => sale.saleType === selectedSaleType);
    }
    
    if (selectedCustomerId !== "all") {
        filtered = filtered.filter(sale => sale.customerId === selectedCustomerId);
    }
    
    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(sale => {
        const numericIdMatch = sale.numericSaleId?.toString().includes(lowerSearchTerm);
        const customerNameMatch = sale.customerName?.toLowerCase().includes(lowerSearchTerm);
        const shopNameMatch = sale.shopName?.toLowerCase().includes(lowerSearchTerm);

        let itemsMatch = false;
        if (sale.items && sale.items.length > 0) {
            itemsMatch = sale.items.some(item => 
                item.productName.toLowerCase().includes(lowerSearchTerm) ||
                (item.productCode && item.productCode.toLowerCase().includes(lowerSearchTerm))
            );
        } else if (sale.instantSaleItemsDescription) {
            itemsMatch = sale.instantSaleItemsDescription.toLowerCase().includes(lowerSearchTerm);
        }
        
        return !!(numericIdMatch || customerNameMatch || shopNameMatch || itemsMatch);
      });
    }

    return filtered.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [sales, searchTerm, selectedCustomerId, selectedSaleType, selectedDateRange]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedDateRange("all_time");
    setSelectedCustomerId("all");
    setSelectedSaleType("all");
  };

  const formatSaleDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "MMM d - hh:mm a"); 
    } catch (e) {
      return "Invalid Date";
    }
  };
  
  const hasActiveFilters = searchTerm.trim() !== "" || selectedDateRange !== "all_time" || selectedCustomerId !== "all" || selectedSaleType !== "all";

  const getItemNamesDisplay = (sale: Sale): string => {
    if (sale.items && sale.items.length > 0) {
      return sale.items.map(item => `${item.productName}${item.productCode ? ` (${item.productCode})` : ''}`).join(", ");
    }
    if (sale.instantSaleItemsDescription) { 
      return sale.instantSaleItemsDescription;
    }
    return "N/A";
  };

  const getTotalQuantityForSale = (sale: Sale): number => {
    if (sale.items && sale.items.length > 0) {
      return sale.items.reduce((sum, item) => sum + item.quantity, 0);
    }
    return 0;
  };

  const getCustomerDisplay = (sale: Sale) => {
    const customer = customers.find(c => c.id === sale.customerId);
    if (customer && customer.name.toLowerCase() === 'cash' && customer.phone !== 'N/A') {
      return (
        <div>
          <span className="font-medium">{customer.name}</span>
          <span className="block text-xs text-muted-foreground">{customer.phone}</span>
        </div>
      );
    }
    if (sale.saleType === "REGULAR" && sale.customerName) return sale.customerName;
    if (sale.saleType === "INSTANT" && sale.customerId && sale.customerName) return sale.customerName; 
    return "-";
  };


  const getShopColumnDisplay = (sale: Sale): string => {
    if (sale.saleType === "REGULAR") return "-";
    if (sale.saleType === "INSTANT" && sale.shopName) return sale.shopName; 
    return "-";
  };


  if (authLoading || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading orders...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to view orders.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <ClipboardList className="mr-2 h-5 w-5 text-primary" /> Sales Orders
          </CardTitle>
          <CardDescription>View, search, and filter your sales history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="lg:col-span-1">
              <Label htmlFor="searchOrders" className="mb-1 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="searchOrders"
                  placeholder="Invoice #, Cust, Shop, Item..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
                <Label htmlFor="saleTypeFilter" className="mb-1 block">Sale Type</Label>
                <Select value={selectedSaleType} onValueChange={(value: "all" | "REGULAR" | "INSTANT") => setSelectedSaleType(value)}>
                    <SelectTrigger id="saleTypeFilter">
                    <SelectValue placeholder="Select sale type" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">All Sale Types</SelectItem>
                    <SelectItem value="REGULAR">Regular Sales</SelectItem>
                    <SelectItem value="INSTANT">Instant Sales</SelectItem>
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
            <div>
              <Label htmlFor="customerFilter" className="mb-1 block">Customer</Label>
              <Select 
                value={selectedCustomerId} 
                onValueChange={setSelectedCustomerId} 
                disabled={customers.length === 0}
              >
                <SelectTrigger id="customerFilter">
                  <SelectValue placeholder={customers.length === 0 ? "No customers" : "Select customer"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
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
            <CardTitle className="text-lg">Order List</CardTitle>
            <CardDescription>
              Showing {filteredAndSearchedSales.length} of {sales.length} total orders for the selected period.
            </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[100px]"><HashIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Invoice #</TableHead>
                <TableHead className="w-[120px]">Sale Type</TableHead>
                <TableHead><UserCircleIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Customer</TableHead>
                <TableHead><Building className="inline mr-1 h-4 w-4 text-muted-foreground"/>Shop</TableHead>
                <TableHead><CalendarDays className="inline mr-1 h-4 w-4 text-muted-foreground"/>Date</TableHead>
                <TableHead className="min-w-[200px]"><PackageIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Items/Desc.</TableHead>
                <TableHead className="w-[70px] text-center">Qty</TableHead>
                <TableHead className="text-right w-[100px]">Subtotal</TableHead>
                <TableHead className="text-right w-[100px]">Discount</TableHead>
                <TableHead className="text-right w-[100px]">Net Total</TableHead>
                <TableHead className="text-center w-[100px]">Return Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSearchedSales.length > 0 ? (
                filteredAndSearchedSales.map((sale) => {
                  const returnStatusInfo = getSaleReturnStatus(sale);
                  const StatusIcon = returnStatusInfo.icon;
                  return (
                    <TableRow key={sale.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">#{sale.numericSaleId}</TableCell>
                      <TableCell>
                        {sale.saleType === "REGULAR" ? 
                          <span className="flex items-center"><RotateCcw className="mr-1.5 h-3.5 w-3.5 text-blue-500"/>Regular</span> : 
                          <span className="flex items-center"><Zap className="mr-1.5 h-3.5 w-3.5 text-orange-500"/>Instant</span>
                        }
                      </TableCell>
                      <TableCell>{getCustomerDisplay(sale)}</TableCell>
                      <TableCell>{getShopColumnDisplay(sale)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatSaleDate(sale.saleDate)}</TableCell>
                      <TableCell className="text-sm truncate max-w-[200px] hover:max-w-none hover:whitespace-normal">
                        {getItemNamesDisplay(sale)}
                      </TableCell>
                      <TableCell className="text-center">{getTotalQuantityForSale(sale)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(sale.subTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {formatCurrency(sale.discountAmount && sale.discountAmount > 0 ? sale.discountAmount : 0, appSettings.currency, currencyForConversionSource)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(sale.grandTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                      <TableCell className={`text-center text-xs font-medium ${returnStatusInfo.color || 'text-foreground'}`}>
                        {StatusIcon && <StatusIcon className={`inline mr-1 h-3.5 w-3.5 ${returnStatusInfo.color || ''}`}/>}
                        {returnStatusInfo.status}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="text-center h-24 text-muted-foreground">
                    {sales.length === 0 ? "No orders found." : 
                     "No orders match your current filters."}
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
