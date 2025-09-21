

import type { DashboardPeriod, DashboardStats, Sale, Customer, Product } from '@/lib/data-types';
import { initialAppSettings } from '@/lib/data';
import { ensureFirestoreInitialized, catchFirebaseError } from './helpers';
import { getSalesForUser } from './sale-service';
import { getCustomersForUser } from './customer-service';
import { getProductsForUser } from './product-service';
import { getSuppliersForUser } from './supplier-service';
import { getAppSettingsFromFirestore } from './app-settings-service';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { collection, query, where, orderBy, getDocs, doc, getDoc, Timestamp, collectionGroup,getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase/clientApp';


export const getDashboardStatsForUser = async (userId: string, period: DashboardPeriod = "this_month"): Promise<DashboardStats> => {
  ensureFirestoreInitialized();
  if (!userId) {
    // Return default/empty stats if no user ID
    return {
      totalRevenue: 0, newCustomersThisPeriod: 0, totalSalesCount: 0,
      lowStockItemsCount: 0, outOfStockItemsCount: 0, lowStockThreshold: initialAppSettings.lowStockThreshold,
      totalProductsInInventory: 0, totalSuppliers: 0, periodLabel: "N/A"
    };
  }

  try {
    const appSettings = await getAppSettingsFromFirestore(userId);
    const salesInPeriod = await getSalesForUser(userId, period);
    const customersInPeriod = await getCustomersForUser(userId, period); 
    
    // Fetch only the products needed for stock counts, not all products.
    const productsCollectionRef = collection(db, `users/${userId}/products`);
    const outOfStockQuery = query(productsCollectionRef, where("stock", "==", 0));
    const lowStockQuery = query(productsCollectionRef, where("stock", ">", 0), where("stock", "<", appSettings.lowStockThreshold));

    const [outOfStockSnapshot, lowStockSnapshot] = await Promise.all([
      getCountFromServer(outOfStockQuery),
      getCountFromServer(lowStockQuery)
    ]);
    
    const outOfStockItemsCount = outOfStockSnapshot.data().count;
    const lowStockItemsCount = lowStockSnapshot.data().count;

    let periodLabel = "";
    switch (period) {
      case "this_month": periodLabel = "This Month"; break;
      case "last_month": periodLabel = "Last Month"; break;
      case "this_year": periodLabel = "This Year"; break;
      case "all_time": periodLabel = "All Time"; break;
    }

    const totalRevenue = salesInPeriod.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const totalSalesCount = salesInPeriod.length;
    const newCustomersThisPeriod = customersInPeriod.length; // This now reflects customers joined in the period

    return {
      totalRevenue,
      newCustomersThisPeriod,
      totalSalesCount,
      lowStockItemsCount,
      outOfStockItemsCount,
      lowStockThreshold: appSettings.lowStockThreshold,
      totalProductsInInventory: appSettings.totalProducts || 0, // Use counter from settings
      totalSuppliers: appSettings.totalSuppliers || 0, // Use counter from settings
      periodLabel,
    };

  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
     return catchFirebaseError(error, 'getDashboardStatsForUser', `user_context/${userId}`);
  }
};

export interface TopProduct {
  name: string;
  quantity: number;
}
export const getTopSellingProductsForUser = async (userId: string, count: number = 5, period: DashboardPeriod = "all_time"): Promise<TopProduct[]> => {
  ensureFirestoreInitialized();
  if (!userId) return [];

  try {
    // Fetch sales FOR THE SPECIFIED PERIOD
    const salesInPeriod = await getSalesForUser(userId, period);
    
    const productQuantities: Record<string, { name: string, quantity: number }> = {};

    salesInPeriod.forEach(sale => {
      sale.items.forEach(item => {
        if (item.productId !== "MANUAL_ENTRY") {
          if (!productQuantities[item.productId]) {
            productQuantities[item.productId] = { name: item.productName, quantity: 0 };
          }
          productQuantities[item.productId].quantity += item.quantity;
        }
      });
    });

    return Object.values(productQuantities)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, count);

  } catch (error) {
    return catchFirebaseError(error, 'getTopSellingProductsForUser', `user_context/${userId}`);
  }
};
