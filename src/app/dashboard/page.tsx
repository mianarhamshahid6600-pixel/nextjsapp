
"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, CreditCard, Package, Activity, BarChartHorizontalBig, Loader2, Trash2, CalendarDays, BarChart3, Boxes, Truck, PackageX, AlertTriangle, Eye, EyeOff } from "lucide-react";
import {
  getDashboardStatsForUser,
  getTopSellingProductsForUser,
  type TopProduct,
} from "@/lib/services/dashboard-service";
import {
  getActivityLogForUser,
  clearActivityLogForUser
} from "@/lib/services/activity-log-service";
import type { ActivityLogEntry, DashboardStats, DashboardPeriod } from "@/lib/data-types";
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, currencySymbols } from "@/lib/currency-utils";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, isCoreDataLoading, appSettings, currencyForConversionSource } = useAuth();
  const { theme } = useTheme();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<ActivityLogEntry[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isClearingActivity, setIsClearingActivity] = useState(false);
  const [isClearActivityConfirmOpen, setIsClearActivityConfirmOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>("this_month");

  // Visibility states
  const [isTotalRevenueVisible, setIsTotalRevenueVisible] = useState(true);


  const fetchDashboardData = async (period: DashboardPeriod) => {
      if (!userId || !appSettings) {
        setIsLoadingData(false);
        setStats(null);
        setRecentActivities([]);
        setTopProducts([]);
        return;
      }
      setIsLoadingData(true);
      try {
        const [dashboardStats, topSelling, activityLog] = await Promise.all([
          getDashboardStatsForUser(userId, period),
          getTopSellingProductsForUser(userId, 5, period),
          getActivityLogForUser(userId, 5)
        ]);

        setStats(dashboardStats);
        setTopProducts(topSelling);
        setRecentActivities(activityLog);

      } catch (error: any) {
        console.error("Failed to fetch dashboard data:", error);
        toast({ title: "Error", description: `Could not load dashboard data: ${error.message}`, variant: "destructive" });
        setStats(null);
        setTopProducts([]);
        setRecentActivities([]);
      } finally {
        setIsLoadingData(false);
      }
    };

  useEffect(() => {
    if (!authLoading && !isCoreDataLoading && userId && appSettings) {
      fetchDashboardData(selectedPeriod);
    } else if (!authLoading && !isCoreDataLoading && (!userId || !appSettings)) {
       setIsLoadingData(false);
       setStats(null);
       setRecentActivities([]);
       setTopProducts([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isCoreDataLoading, userId, appSettings, toast, selectedPeriod]);

  const handleClearActivityLog = async () => {
    if (!userId) {
      toast({ title: "Error", description: "User ID not found.", variant: "destructive" });
      return;
    }
    setIsClearingActivity(true);
    try {
      const { deletedCount } = await clearActivityLogForUser(userId);
      toast({ title: "Activity Log Cleared", description: `${deletedCount} entries removed. The log is now empty.` });
      setRecentActivities([]);
    } catch (error: any) {
      toast({ title: "Error Clearing Log", description: error.message || "Could not clear activity log.", variant: "destructive" });
    } finally {
      setIsClearingActivity(false);
      setIsClearActivityConfirmOpen(false);
    }
  };


  if (authLoading || isCoreDataLoading || isLoadingData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading dashboard data...</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-center text-lg">Please log in to view the dashboard.</p>;
  }

  if (!stats) {
    return (
        <div className="text-center">
            <p className="text-lg mb-4">Error loading dashboard data for the selected period. Please try refreshing or selecting a different period.</p>
             <Select value={selectedPeriod} onValueChange={(value: DashboardPeriod) => setSelectedPeriod(value)}>
                <SelectTrigger className="w-[220px] mx-auto">
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
    );
  }


  const formatActivityTimestamp = (isoTimestamp: string) => {
    try {
      return format(new Date(isoTimestamp), "PPpp");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const chartTextColor = theme === 'dark' ? '#cbd5e1' : '#475569';
  const obfuscationChar = appSettings.obfuscationCharacter || '*';


  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-headline text-foreground">Dashboard Overview</h2>
        <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <Select value={selectedPeriod} onValueChange={(value: DashboardPeriod) => setSelectedPeriod(value)}>
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
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue ({stats.periodLabel})
            </CardTitle>
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
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative h-8 min-w-[100px]">
                <span
                  className={cn(
                    "absolute inset-0 flex items-center text-3xl font-bold font-headline text-foreground transition-opacity duration-300 ease-in-out",
                    isTotalRevenueVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  {formatCurrency(stats.totalRevenue, appSettings.currency, currencyForConversionSource)}
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center text-2xl font-bold font-headline text-foreground transition-opacity duration-300 ease-in-out",
                    !isTotalRevenueVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                >
                  {`${currencySymbols[appSettings.currency] || appSettings.currency} ${obfuscationChar.repeat(5)}`}
                </span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales ({stats.periodLabel})</CardTitle>
            <CreditCard className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">+{stats.totalSalesCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Customers ({stats.periodLabel})</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">+{stats.newCustomersThisPeriod}</div>
          </CardContent>
        </Card>
         <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Out of Stock Items</CardTitle>
            <PackageX className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">{stats.outOfStockItemsCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock Items</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">{stats.lowStockItemsCount}</div>
            <p className="text-xs text-muted-foreground pt-1">
              Stock &gt; 0 and &lt; {stats.lowStockThreshold}
            </p>
          </CardContent>
        </Card>
         <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
            <Boxes className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">
              {stats.totalProductsInInventory}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Suppliers</CardTitle>
            <Truck className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">
              {stats.totalSuppliers}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl text-foreground flex items-center">
              <BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary"/>Top Selling Products ({stats.periodLabel})
            </CardTitle>
            <CardDescription>Top 5 products by quantity sold in the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2 pr-4 h-[350px]">
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke={chartTextColor} />
                  <YAxis dataKey="name" type="category" stroke={chartTextColor} width={120} tick={{ fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{ color: chartTextColor }}/>
                  <Bar dataKey="quantity" fill="hsl(var(--primary))" name="Quantity Sold" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-muted/30 rounded-lg flex items-center justify-center p-4">
                <p className="text-muted-foreground">No sales data available to show top products for this period.</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-3 shadow-md">
           <CardHeader className="relative pt-4 pb-2 px-4">
            <div className="text-center mb-1">
              <CardTitle className="font-headline text-xl text-foreground flex items-center justify-center">
                <Activity className="mr-2 h-5 w-5 text-primary"/>
                Recent Activity
              </CardTitle>
              <CardDescription className="mt-0.5">
                Latest transactions and updates for your account.
              </CardDescription>
            </div>
            <div className="absolute top-3 right-3">
              <AlertDialog open={isClearActivityConfirmOpen} onOpenChange={setIsClearActivityConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    disabled={isClearingActivity || recentActivities.length === 0}
                    title="Clear Activity Log"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Clear Activity Log</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all activity log entries for your account. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isClearingActivity}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearActivityLog} disabled={isClearingActivity} className="bg-destructive hover:bg-destructive/90">
                      {isClearingActivity ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                      Delete All Activities
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent className="max-h-[350px] overflow-y-auto pt-2">
            {isClearingActivity ? (
                 <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="ml-3">Clearing activities...</p>
                </div>
            ) : recentActivities.length > 0 ? (
              <ul className="space-y-3">
                {recentActivities.map(activity => (
                  <li key={activity.id} className="flex flex-col pb-2 border-b border-dashed last:border-b-0">
                    <div className="flex items-center justify-between">
                       <p className="font-medium text-sm text-foreground flex-1 pr-2">{activity.description}</p>
                       <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                         activity.type === 'SALE' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                         activity.type === 'INVENTORY_UPDATE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                         activity.type === 'NEW_CUSTOMER' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                         activity.type === 'CUSTOMER_UPDATE' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' :
                         activity.type === 'CUSTOMER_DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                         activity.type === 'SETTINGS_UPDATE' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                         activity.type === 'ACCOUNT_CREATED' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' :
                         'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                       }`}>
                         {activity.type.replace('_', ' ').toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                       </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatActivityTimestamp(activity.timestamp)}</p>
                    {activity.details?.productName && <p className="text-xs text-muted-foreground">Product: {activity.details.productName}</p>}
                    {activity.details?.customerName && <p className="text-xs text-muted-foreground">Customer: {activity.details.customerName}</p>}
                    {activity.details?.numericSaleId && <p className="text-xs text-muted-foreground">Sale Ref: #{activity.details.numericSaleId}</p>}
                    {activity.details?.firestoreSaleId && !activity.details?.numericSaleId && <p className="text-xs text-muted-foreground">Sale Doc ID: <span className="truncate max-w-[50px] inline-block align-bottom">{activity.details.firestoreSaleId}</span></p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-center py-10">No recent activity.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
