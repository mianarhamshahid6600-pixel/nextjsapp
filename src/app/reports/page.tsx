
"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, TrendingDown, Landmark, Scale, Loader2, Eye, EyeOff } from "lucide-react";
import { getSalesForUser } from "@/lib/services/sale-service"; 
import type { Sale } from "@/lib/data-types"; 
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, currencySymbols } from "@/lib/currency-utils";
import { cn } from "@/lib/utils";


interface ReportMetrics {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  profitMargin: number;
  totalSalesCount: number;
}

interface MonthlyProfit {
  month: string;
  profit: number;
  revenue: number;
  cogs: number;
}

type ReportPeriod = "all_time" | "this_month" | "last_month" | "this_year";

export default function ReportsPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth(); 
  const { theme } = useTheme();

  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("this_month");

  // Visibility states
  const [isTotalRevenueVisible, setIsTotalRevenueVisible] = useState(true);
  const [isTotalCogsVisible, setIsTotalCogsVisible] = useState(true);
  const [isGrossProfitVisible, setIsGrossProfitVisible] = useState(true);
  

  useEffect(() => {
    const fetchSalesData = async () => {
      if (!userId || !appSettings) { 
        setIsLoadingData(false);
        setSales([]);
        return;
      }
      setIsLoadingData(true);
      try {
        const loadedSales = await getSalesForUser(userId);
        setSales(loadedSales);
      } catch (error: any) {
        console.error("Failed to load sales data for reports:", error);
        toast({ title: "Error", description: "Could not load sales data.", variant: "destructive" });
        setSales([]);
      } finally {
        setIsLoadingData(false);
      }
    };
    
    if (!authLoading && userId && appSettings) { 
      fetchSalesData();
    } else if (!authLoading && (!userId || !appSettings)) {
        setIsLoadingData(false);
        setSales([]);
    }
  }, [authLoading, userId, appSettings, toast]); 

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    const now = new Date();
    switch (reportPeriod) {
      case "this_month":
        const currentMonthStart = startOfMonth(now);
        const currentMonthEnd = endOfMonth(now);
        return sales.filter(sale => {
          const saleDate = new Date(sale.saleDate);
          return saleDate >= currentMonthStart && saleDate <= currentMonthEnd;
        });
      case "last_month":
        const lastMonth = subMonths(now, 1);
        const lastMonthStart = startOfMonth(lastMonth);
        const lastMonthEnd = endOfMonth(lastMonth);
        return sales.filter(sale => {
          const saleDate = new Date(sale.saleDate);
          return saleDate >= lastMonthStart && saleDate <= lastMonthEnd;
        });
      case "this_year":
        const currentYearStart = startOfYear(now);
        const currentYearEnd = endOfYear(now);
         return sales.filter(sale => {
          const saleDate = new Date(sale.saleDate);
          return saleDate >= currentYearStart && saleDate <= currentYearEnd;
        });
      case "all_time":
      default:
        return sales;
    }
  }, [sales, reportPeriod]);

  const reportMetrics = useMemo((): ReportMetrics => {
    let totalRevenue = 0;
    let totalCogs = 0;
    
    filteredSales.forEach(sale => {
      totalRevenue += sale.grandTotal;
      
      if (sale.items && sale.items.length > 0) { 
        sale.items.forEach(item => { 
          const costPrice = typeof item.costPrice === 'number' ? item.costPrice : 0;
          totalCogs += costPrice * item.quantity;
        });
      } else if (sale.estimatedTotalCogs !== undefined && typeof sale.estimatedTotalCogs === 'number') { 
        totalCogs += sale.estimatedTotalCogs;
      }
    });

    const grossProfit = totalRevenue - totalCogs;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCogs,
      grossProfit,
      profitMargin,
      totalSalesCount: filteredSales.length,
    };
  }, [filteredSales]);

  const monthlyProfitData = useMemo((): MonthlyProfit[] => {
    const data: Record<string, { profit: number, revenue: number, cogs: number, count: number }> = {};
    const salesForChart = (reportPeriod === "all_time") ? sales : filteredSales;

    salesForChart.forEach(sale => {
      const saleDate = new Date(sale.saleDate);
      if (isNaN(saleDate.getTime())) {
          console.warn("Invalid saleDate encountered in report generation:", sale);
          return; 
      }
      const monthYear = format(saleDate, "MMM yyyy");

      if (!data[monthYear]) {
        data[monthYear] = { profit: 0, revenue: 0, cogs: 0, count: 0 };
      }
      
      let saleCogs = 0;
      if (sale.items && sale.items.length > 0) { 
        sale.items.forEach(item => {
          const costPrice = typeof item.costPrice === 'number' ? item.costPrice : 0;
          saleCogs += costPrice * item.quantity;
        });
      } else if (sale.estimatedTotalCogs !== undefined && typeof sale.estimatedTotalCogs === 'number') { 
        saleCogs += sale.estimatedTotalCogs;
      }

      data[monthYear].revenue += sale.grandTotal;
      data[monthYear].cogs += saleCogs;
      data[monthYear].profit += (sale.grandTotal - saleCogs);
      data[monthYear].count++;
    });

    return Object.entries(data)
      .map(([month, values]) => ({ month, ...values }))
      .sort((a,b) => new Date(a.month).getTime() - new Date(b.month).getTime()); 
  }, [sales, filteredSales, reportPeriod]);


  const chartTextColor = theme === 'dark' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'; 
  const obfuscationChar = appSettings.obfuscationCharacter || '*';

  if (authLoading || isLoadingData || !appSettings) { 
     return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading reports data...</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to view reports.</p>;
  }

  const formatLocalCurrency = (amount: number) => {
    return formatCurrency(amount, appSettings.currency, currencyForConversionSource);
  }

  const getPeriodLabel = () => {
    switch (reportPeriod) {
      case 'this_month': return 'This Month';
      case 'last_month': return 'Last Month';
      case 'this_year': return 'This Year';
      case 'all_time': return 'All Time';
      default: return 'Selected Period';
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline text-xl">Profit & Loss Report</CardTitle>
            <CardDescription>Summary for {getPeriodLabel()}</CardDescription>
          </div>
          <Select value={reportPeriod} onValueChange={(value: ReportPeriod) => setReportPeriod(value)}>
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
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <div className="flex items-center">
              <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsTotalRevenueVisible(!isTotalRevenueVisible)}
                  className="h-6 w-6 mr-1 text-muted-foreground hover:text-primary"
                  title={isTotalRevenueVisible ? "Hide amount" : "Show amount"}
              >
                  {isTotalRevenueVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative h-8 min-w-[100px]">
                 <span
                  className={cn(
                    "absolute inset-0 flex items-center text-2xl font-bold font-headline text-foreground transition-opacity duration-300 ease-in-out",
                    isTotalRevenueVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  {formatLocalCurrency(reportMetrics.totalRevenue)}
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center text-xl font-bold font-headline text-foreground transition-opacity duration-300 ease-in-out",
                    !isTotalRevenueVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                </span>
            </div>
             <p className="text-xs text-muted-foreground">{reportMetrics.totalSalesCount} sales</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total COGS</CardTitle>
            <div className="flex items-center">
              <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsTotalCogsVisible(!isTotalCogsVisible)}
                  className="h-6 w-6 mr-1 text-muted-foreground hover:text-primary"
                  title={isTotalCogsVisible ? "Hide amount" : "Show amount"}
              >
                  {isTotalCogsVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative h-8 min-w-[100px]">
                 <span
                  className={cn(
                    "absolute inset-0 flex items-center text-2xl font-bold font-headline text-foreground transition-opacity duration-300 ease-in-out",
                    isTotalCogsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  {formatLocalCurrency(reportMetrics.totalCogs)}
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center text-xl font-bold font-headline text-foreground transition-opacity duration-300 ease-in-out",
                    !isTotalCogsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                </span>
            </div>
            <p className="text-xs text-muted-foreground">Cost of Goods Sold</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit</CardTitle>
            <div className="flex items-center">
              <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsGrossProfitVisible(!isGrossProfitVisible)}
                  className="h-6 w-6 mr-1 text-muted-foreground hover:text-primary"
                  title={isGrossProfitVisible ? "Hide amount" : "Show amount"}
              >
                  {isGrossProfitVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative h-8 min-w-[100px]">
                 <span
                  className={cn(
                    "absolute inset-0 flex items-center text-2xl font-bold font-headline transition-opacity duration-300 ease-in-out",
                    isGrossProfitVisible ? "opacity-100" : "opacity-0 pointer-events-none",
                    reportMetrics.grossProfit >= 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'
                  )}
                >
                  {formatLocalCurrency(reportMetrics.grossProfit)}
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center text-xl font-bold font-headline transition-opacity duration-300 ease-in-out",
                    !isGrossProfitVisible ? "opacity-100" : "opacity-0 pointer-events-none",
                    reportMetrics.grossProfit >= 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'
                  )}
                >
                  {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                </span>
            </div>
            <p className="text-xs text-muted-foreground">Revenue - COGS</p>
          </CardContent>
        </Card>
         <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit Margin</CardTitle>
            <Scale className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-headline ${reportMetrics.profitMargin >= 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'}`}>
              {reportMetrics.profitMargin.toFixed(2)}%
            </div>
             <p className="text-xs text-muted-foreground">(Profit / Revenue) * 100</p>
          </CardContent>
        </Card>
         <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
            <Landmark className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">{reportMetrics.totalSalesCount}</div>
             <p className="text-xs text-muted-foreground">Transactions in period</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Monthly Profit Trend</CardTitle>
          <CardDescription>Revenue, COGS, and Profit over time. Focus: {getPeriodLabel()}</CardDescription>
        </CardHeader>
        <CardContent className="pl-2 pr-4 h-[400px]">
          {monthlyProfitData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyProfitData.slice(-12)} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}> 
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke={chartTextColor} tick={{ fontSize: 12 }} />
                <YAxis stroke={chartTextColor} tickFormatter={(value) => `${appSettings.currency}${value/1000}k`} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number, name: string) => [formatLocalCurrency(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                />
                <Legend wrapperStyle={{ color: chartTextColor, paddingTop: '10px' }}/>
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cogs" fill="hsl(var(--destructive))" name="COGS" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="hsl(var(--accent))" name="Profit" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
             <div className="w-full h-full bg-muted/30 rounded-lg flex items-center justify-center p-4">
                <p className="text-muted-foreground">No sales data available for the selected period to show profit trends.</p>
              </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
