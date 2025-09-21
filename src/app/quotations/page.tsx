

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Search, FilterX, FileText as FileTextIcon, CalendarDays, UserCircle, DollarSignIcon, PlusCircle, Edit } from "lucide-react";
import { getQuotationsForUser, updateQuotationForUser, syncExpiredQuotationStatusesOnLoad } from "@/lib/services/quotation-service"; 
import type { Quotation, Customer, AppSettings, QuotationStatus, DashboardPeriod } from "@/lib/data-types"; 
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DateRangeFilter = DashboardPeriod;
const quotationStatuses: QuotationStatus[] = ["Draft", "Sent", "Accepted", "Declined", "Expired"];


export default function QuotationsListPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth();
  const router = useRouter();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isUpdatingStatusForQuoteId, setIsUpdatingStatusForQuoteId] = useState<string | null>(null);


  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeFilter>("all_time");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all"); 

  const fetchData = useCallback(async () => {
    if (!userId || !appSettings) {
      setIsLoadingData(false);
      setQuotations([]);
      return;
    }
    setIsLoadingData(true);
    try {
      // Sync statuses first
      const updatedCount = await syncExpiredQuotationStatusesOnLoad(userId);
      if (updatedCount > 0) {
        toast({title: "Quotations Synced", description: `${updatedCount} quotation(s) were automatically updated to 'Expired'.`, variant: "default"});
      }
      // Then fetch the potentially updated list, filtered by date
      const loadedQuotations = await getQuotationsForUser(userId, selectedDateRange);
      setQuotations(loadedQuotations);
    } catch (error: any) {
      console.error("Failed to load quotations:", error);
      toast({ title: "Error", description: "Could not load quotations.", variant: "destructive" });
      setQuotations([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, appSettings, toast, selectedDateRange]); 

  useEffect(() => {
    if (!authLoading && userId && appSettings) {
      fetchData();
    } else if (!authLoading && (!userId || !appSettings)) {
      setIsLoadingData(false);
      setQuotations([]);
    }
  }, [authLoading, userId, appSettings, fetchData]); 

  const handleStatusChange = async (quotationId: string, newStatus: QuotationStatus) => {
    if (!userId) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return;
    }
    setIsUpdatingStatusForQuoteId(quotationId);
    try {
      await updateQuotationForUser(userId, quotationId, { status: newStatus });
      toast({ title: "Status Updated", description: `Quotation status changed to ${newStatus}.` });
      fetchData(); 
    } catch (error: any) {
      toast({ title: "Error Updating Status", description: error.message || "Could not update status.", variant: "destructive" });
    } finally {
      setIsUpdatingStatusForQuoteId(null);
    }
  };


  const filteredAndSearchedQuotations = useMemo(() => {
    let filtered = [...quotations]; // Already date-filtered from service
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(q =>
        q.customerName.toLowerCase().includes(lowerSearch) ||
        q.numericQuotationId.toString().includes(lowerSearch) ||
        q.items.some(item => item.name.toLowerCase().includes(lowerSearch))
      );
    }
    if (selectedStatusFilter !== "all") { 
      filtered = filtered.filter(q => q.status === selectedStatusFilter);
    }
    return filtered.sort((a, b) => new Date(b.quoteDate).getTime() - new Date(a.quoteDate).getTime());
  }, [quotations, searchTerm, selectedStatusFilter]); 

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedDateRange("all_time");
    setSelectedStatusFilter("all"); 
  };

  const formatDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "PP");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const hasActiveFilters = searchTerm.trim() !== "" || selectedDateRange !== "all_time" || selectedStatusFilter !== "all"; 

  if (authLoading || isLoadingData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading quotations...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to view quotations.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <CardHeader className="p-0">
          <CardTitle className="font-headline text-xl flex items-center">
            <FileTextIcon className="mr-2 h-5 w-5 text-primary" /> Quotations
          </CardTitle>
          <CardDescription>Manage and track your customer quotations.</CardDescription>
        </CardHeader>
        <Link href="/quotations/add" passHref>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Quotation
          </Button>
        </Link>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Filters & Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="searchQuotations">Search (ID, Customer, Item Name)</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="searchQuotations"
                  placeholder="E.g., #101, Acme Corp, Laptop"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="statusFilter">Status</Label>
              <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}> 
                <SelectTrigger id="statusFilter" className="mt-1"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {quotationStatuses.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dateRangeFilter">Date Range</Label>
              <Select value={selectedDateRange} onValueChange={(value: DateRangeFilter) => setSelectedDateRange(value)}>
                <SelectTrigger id="dateRangeFilter" className="mt-1"><SelectValue placeholder="Select date range" /></SelectTrigger>
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
            <CardTitle className="text-lg">Quotation List</CardTitle>
            <CardDescription>
              Showing {filteredAndSearchedQuotations.length} of {quotations.length} total quotations for the selected period.
            </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead><UserCircle className="inline mr-1 h-4 w-4 text-muted-foreground"/>Customer</TableHead>
                <TableHead><CalendarDays className="inline mr-1 h-4 w-4 text-muted-foreground"/>Quote Date</TableHead>
                <TableHead><CalendarDays className="inline mr-1 h-4 w-4 text-muted-foreground"/>Valid Till</TableHead>
                <TableHead className="text-right"><DollarSignIcon className="inline mr-1 h-4 w-4 text-muted-foreground"/>Total</TableHead>
                <TableHead className="w-[150px]">Status</TableHead> 
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSearchedQuotations.length > 0 ? (
                filteredAndSearchedQuotations.map((quote) => (
                  <TableRow key={quote.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">#{quote.numericQuotationId}</TableCell>
                    <TableCell>{quote.customerName}</TableCell>
                    <TableCell className="text-sm">{formatDate(quote.quoteDate)}</TableCell>
                    <TableCell className="text-sm">{formatDate(quote.validTillDate)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(quote.grandTotal, appSettings.currency, currencyForConversionSource)}</TableCell>
                    <TableCell>
                      {isUpdatingStatusForQuoteId === quote.id ? (
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      ) : (
                        <Select
                          value={quote.status}
                          onValueChange={(newStatus: QuotationStatus) => handleStatusChange(quote.id, newStatus)}
                          disabled={isUpdatingStatusForQuoteId === quote.id}
                        >
                          <SelectTrigger className={`h-8 text-xs ${
                            quote.status === 'Draft' ? 'bg-yellow-100/50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' :
                            quote.status === 'Sent' ? 'bg-blue-100/50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700' :
                            quote.status === 'Accepted' ? 'bg-green-100/50 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700' :
                            quote.status === 'Declined' ? 'bg-red-100/50 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700' :
                            quote.status === 'Expired' ? 'bg-gray-100/50 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300 border-gray-300 dark:border-gray-600' :
                            'border-input'
                          }`}>
                            <SelectValue placeholder="Set status" />
                          </SelectTrigger>
                          <SelectContent>
                            {quotationStatuses.map(status => (
                              <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => router.push(`/quotations/edit/${quote.id}`)} title="Edit Quotation">
                        <Edit className="mr-1 h-3 w-3"/> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                 <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                        {quotations.length === 0 && !isLoadingData ? "No quotations found for this period." : 
                         (isLoadingData ? "Loading quotations..." : "No quotations match current filters for this period.")}
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

