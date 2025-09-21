

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Search, FilterX, PackageOpen, CalendarDays, UserCircle, DollarSignIcon, HashIcon, FileText } from "lucide-react";
import { getReturnsForUser } from "@/lib/services/return-service"; 
import type { Return as ReturnType, DashboardPeriod, Customer } from "@/lib/data-types"; // Renamed to avoid conflict with React Return type
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";

type DateRangeFilter = DashboardPeriod;

export default function ReturnsListPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, coreAppData } = useAuth(); 

  const { returns, customers } = coreAppData;
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeFilter>("all_time");

  const fetchData = useCallback(async () => {
    if (!userId || !appSettings) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      // Data is now pre-loaded via coreAppData, so no need for a separate fetch here.
      // We just set loading to false.
    } catch (error: any) {
      console.error("Failed to load returns data:", error);
      toast({ title: "Error", description: "Could not load returns data.", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, appSettings, toast]);

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
    }
  }, [authLoading, userId, appSettings, fetchData]);

  const filteredAndSearchedReturns = useMemo(() => {
    let filtered = [...returns]; 
    
    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(ret => 
        ret.numericReturnId.toString().includes(lowerSearchTerm) ||
        (ret.originalNumericSaleId && ret.originalNumericSaleId.toString().includes(lowerSearchTerm)) ||
        (ret.customerName && ret.customerName.toLowerCase().includes(lowerSearchTerm)) ||
        ret.items.some(item => item.productName.toLowerCase().includes(lowerSearchTerm))
      );
    }

    return filtered.sort((a, b) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime());
  }, [returns, searchTerm]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedDateRange("all_time");
  };

  const formatReturnDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "PPp"); 
    } catch (e) {
      return "Invalid Date";
    }
  };
  
  const hasActiveFilters = searchTerm.trim() !== "" || selectedDateRange !== "all_time";

  const getItemNamesDisplay = (ret: ReturnType): string => {
    if (ret.items && ret.items.length > 0) {
      return ret.items.map(item => `${item.productName} (x${item.quantityReturned})`).join(", ");
    }
    return "N/A";
  };
  
  const getCustomerDisplay = (ret: ReturnType) => {
    const customer = customers.find(c => c.id === ret.customerId);
    if (customer && customer.name.toLowerCase() === 'cash' && customer.phone !== 'N/A') {
      return (
        <div>
          <span className="font-medium">{customer.name}</span>
          <span className="block text-xs text-muted-foreground">{customer.phone}</span>
        </div>
      );
    }
    return ret.customerName || "N/A";
  };


  if (authLoading || isLoadingData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading returns...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to view returns.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center">
            <PackageOpen className="mr-2 h-5 w-5 text-primary" /> Processed Returns
          </CardTitle>
          <CardDescription>View, search, and filter your processed returns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="searchReturns" className="mb-1 block">Search (Return ID, Invoice #, Customer, Item)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="searchReturns"
                  placeholder="E.g., #12, INV-100, John Doe, Laptop"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
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
            <CardTitle className="text-lg">Return List</CardTitle>
            <CardDescription>
              Showing {filteredAndSearchedReturns.length} of {returns.length} total returns for the selected period.
            </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[80px]"><HashIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Return ID</TableHead>
                <TableHead className="w-[100px]"><FileText className="inline mr-1 h-4 w-4 text-muted-foreground"/>Orig. Inv #</TableHead>
                <TableHead><UserCircle className="inline mr-1 h-4 w-4 text-muted-foreground"/>Customer</TableHead>
                <TableHead><CalendarDays className="inline mr-1 h-4 w-4 text-muted-foreground"/>Return Date</TableHead>
                <TableHead className="min-w-[200px]">Items Returned</TableHead>
                <TableHead className="text-right">Refund</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSearchedReturns.length > 0 ? (
                filteredAndSearchedReturns.map((ret) => (
                  <TableRow key={ret.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">#{ret.numericReturnId}</TableCell>
                    <TableCell>{ret.originalNumericSaleId ? `#${ret.originalNumericSaleId}` : 'N/A'}</TableCell>
                    <TableCell>{getCustomerDisplay(ret)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatReturnDate(ret.returnDate)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[200px] hover:max-w-none hover:whitespace-normal">
                      {getItemNamesDisplay(ret)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(ret.netRefundAmount, appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[150px] hover:max-w-none hover:whitespace-normal">{ret.reason}</TableCell>
                  </TableRow>
                ))
              ) : (
                 <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                        {returns.length === 0 && !isLoadingData ? "No returns found for this period." : 
                         (isLoadingData ? "Loading returns..." : "No returns match current filters for this period.")}
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
