

export interface Product {
  id: string;
  productCode: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  category?: string;
  supplier?: string;
  lastUpdated: string;
  discountPercentage?: number;
}

export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  address?: string;
  joinedDate: string;
}

export interface Supplier {
  id: string;
  name: string;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  gstTaxNumber?: string;
  openingBalance: number;
  openingBalanceType: 'owedToSupplier' | 'owedByUser';
  currentBalance: number;
  notes?: string;
  dateAdded: string;
}

export interface OrderItem { // Client-side representation for checkout page
  id: string;
  productCode?: string;
  name: string;
  orderQuantity: number;
  price: number; // Price AFTER item-specific discount
  originalPrice?: number; // Price BEFORE item-specific discount
  itemDiscountPercentage?: number; // Item-specific discount %
  total: number;
  costPrice?: number;
  isManualEntry?: boolean;
  stock?: number;
  category?: string;
}


export interface SaleItem {
  productId: string; // "MANUAL_ENTRY" for non-inventoried items
  productCode?: string; // Undefined for manual items
  productName: string;
  quantity: number;
  price: number; // Price AFTER item-specific discount for inventoried, or manual price
  originalPriceBeforeItemDiscount?: number; // Original price if item discount applied (for inventoried)
  itemDiscountAppliedPercentage?: number; // Discount % applied to this item (for inventoried)
  costPrice: number; // 0 for manual items if not provided, otherwise the entered cost for manual.
  total: number; // price * quantity
}

export interface Sale {
  id:string;
  numericSaleId: number;
  saleType: "REGULAR" | "INSTANT";
  customerId?: string;
  customerName?: string;
  shopName?: string; // Optional for instant sales
  items: SaleItem[];
  instantSaleItemsDescription?: string;
  estimatedTotalCogs?: number;
  subTotal: number;
  discountAmount?: number;
  grandTotal: number;
  saleDate: string;
}

export interface PurchaseItem {
  productId: string;
  productCode?: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
  itemTotal: number;
  salePrice?: number; // Added for creating new products via purchase
}

export interface PurchaseInvoice {
  id: string;
  numericPurchaseId: number;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  items: PurchaseItem[];
  subTotal: number;
  taxAmount?: number;
  grandTotal: number;
  amountPaid: number;
  paymentStatus: 'paid' | 'partially_paid' | 'unpaid';
  notes?: string;
  createdAt: string;
}

export type QuotationStatus = "Draft" | "Sent" | "Accepted" | "Declined" | "Expired";

export interface QuotationItem {
  productId?: string; // Optional: if linking to an existing product/service
  productCode?: string; // Optional: product code if linked from inventory
  name: string; // Renamed from description
  quantity: number;
  salePrice: number; // Renamed from unitPrice
  costPrice?: number; // Added cost price
  discountPercentage: number; // Item-specific discount
  taxPercentage: number; // Item-specific tax
  itemSubtotal: number; // quantity * salePrice (before item discount)
  itemDiscountAmount: number; // Calculated from discountPercentage on itemSubtotal
  priceAfterItemDiscount: number; // itemSubtotal - itemDiscountAmount
  itemTaxAmount: number; // Calculated from taxPercentage (on priceAfterItemDiscount)
  itemTotal: number; // priceAfterItemDiscount + itemTaxAmount
}

export interface Quotation {
  id: string;
  numericQuotationId: number;
  customerId?: string; // Made optional for manual customer entry
  customerName: string; // Now mandatory, can be manual or from selected customer
  customerDetails?: {
    email?: string;
    phone?: string;
    address?: string;
    companyName?: string;
  };
  quoteDate: string; // ISO string
  validTillDate: string; // ISO string
  items: QuotationItem[];
  subTotal: number; // Sum of all itemSubtotals (before item discounts)
  totalItemDiscountAmount: number; // Sum of all itemDiscountAmounts
  totalItemTaxAmount: number; // Sum of all itemTaxAmounts
  overallDiscountAmount: number; // Additional discount
  overallTaxAmount: number; // Additional tax
  shippingCharges: number;
  extraCosts: number;
  grandTotal: number;
  termsAndConditions?: string;
  paymentMethods?: string;
  notes?: string;
  status: QuotationStatus;
  createdAt: string; // ISO string
  lastUpdatedAt: string; // ISO string
}

export interface ReturnItem {
  productId: string; // "MANUAL_ENTRY" for non-inventoried items
  productCode?: string | null; // Undefined for manual items, or code from inventory
  productName: string;
  quantityReturned: number;
  originalSalePrice: number; // Price at which it was sold per unit
  returnReason?: string;
  itemSubtotal: number; // quantityReturned * originalSalePrice
  stockUpdated?: boolean | null; // Flag: true if stock updated, false if skipped (product not found), null/undefined if manual
}

export interface Return {
  id: string;
  numericReturnId: number;
  originalSaleId?: string | null; // Firestore ID of the original sale
  originalNumericSaleId?: number | null; // Display ID of the original sale
  customerId?: string | null;
  customerName?: string;
  items: ReturnItem[];
  returnDate: string; // ISO string
  reason: string; // Overall reason if not item-specific, or general reason
  refundMethod?: string | null; // How the customer was "refunded" or compensated
  subtotalReturnedAmount: number; // Sum of itemSubtotals for returned items
  adjustmentAmount: number;
  adjustmentType: 'deduct' | 'add';
  netRefundAmount: number;
  notes?: string | null;
  createdAt: string; // ISO string
}


export type ActivityLogType =
  | "SALE"
  | "INVENTORY_UPDATE"
  | "NEW_CUSTOMER"
  | "STOCK_ADD"
  | "CUSTOMER_UPDATE"
  | "CUSTOMER_DELETE"
  | "PRODUCT_DELETE"
  | "SETTINGS_UPDATE"
  | "ACCOUNT_CREATED"
  | "NEW_SUPPLIER"
  | "SUPPLIER_UPDATE"
  | "SUPPLIER_DELETE"
  | "PURCHASE_RECORDED"
  | "SUPPLIER_BALANCE_UPDATE"
  | "BUSINESS_CASH_ADJUSTMENT"
  | "QUOTATION_CREATED"
  | "QUOTATION_UPDATED"
  | "QUOTATION_STATUS_CHANGED"
  | "RETURN_PROCESSED"
  | "SHOP_NAME_UPDATE"
  | "DATA_BACKUP"
  | "DATA_RESTORE";


export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: ActivityLogType;
  description: string;
  details?: any;
}

export interface BackupConfig {
  autoBackupFrequency: 'disabled' | 'daily' | 'weekly' | 'monthly';
  lastManualBackupTimestamp?: string; // ISO string
  lastAutoBackupTimestamp?: string; // ISO string for future use
}

export interface AppSettings {
  lowStockThreshold: number;
  lastSaleNumericId: number;
  lastCustomerNumericId: number;
  lastPurchaseNumericId: number;
  lastQuotationNumericId: number;
  lastReturnNumericId: number;
  currency: string;
  hasCompletedInitialSetup?: boolean;
  companyDisplayName?: string;
  dateOfBirth?: string | null;
  currentBusinessCash: number;
  walkInCustomerDefaultName?: string;
  knownCategories?: string[];
  knownShopNames?: string[];
  backupConfig: BackupConfig; 
  obfuscationCharacter: '*' | '•';
  toastDuration: number;
  totalProducts: number; // Added counter
  totalSuppliers: number; // Added counter
  promptCreditOnDelete?: boolean; // New setting
}

export type DashboardPeriod = "this_month" | "last_month" | "this_year" | "all_time";

export interface DashboardStats {
  totalRevenue: number;
  newCustomersThisPeriod: number;
  totalSalesCount: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
  lowStockThreshold: number;
  totalProductsInInventory: number;
  totalSuppliers: number;
  periodLabel: string;
}

// Types for Financial Overview Page
export type FinancialTransactionType =
  | "sale_income"
  | "purchase_payment"
  | "manual_adjustment_credit"
  | "manual_adjustment_debit"
  | "supplier_payment" // Crucial for payments to suppliers
  | "other_expense"
  | "other_income"
  | "initial_balance_set"
  | "sale_return"
  | "stock_adjustment_credit"; // New type for stock decrease value reclaim

export interface BusinessTransaction {
  userId: string;
  id: string;
  date: string;
  description: string;
  type: FinancialTransactionType;
  amount: number; // Positive for inflow to business, negative for outflow
  notes?: string;
  relatedDocumentId?: string; // e.g., Sale ID, Purchase ID, Return ID, Product ID for stock adjustments, Supplier ID for supplier payments
}

export type FinancialOverviewPeriod = "this_month" | "last_month" | "this_year" | "all_time";


// --- AuthContext specific types for pre-loaded data ---
export interface CoreAppData {
  products: Product[];
  customers: Customer[]; // Might exclude walk-in if handled separately
  suppliers: Supplier[];
  sales: Sale[];
  purchaseInvoices: PurchaseInvoice[];
  quotations: Quotation[];
  returns: ReturnType[];
  // Business transactions and activity logs are typically fetched on demand or in specific contexts
  // rather than being part of "core app data" loaded universally, due to potential size.
  // businessTransactions?: BusinessTransaction[];
  // activityLog?: ActivityLogEntry[];
}

// Backup Data Structure (stored in Firestore `users/{userId}/backups/{backupId}`)
export interface BackupDocument {
  createdAt: string; // ISO String (converted from Firestore Timestamp on read)
  description: string; // e.g., "Manual Backup - YYYY-MM-DD HH:MM"
  version: number; // For schema versioning of the backup data
  data: {
    products: Product[];
    customers: Customer[];
    suppliers: Supplier[];
    sales: Sale[];
    purchaseInvoices: PurchaseInvoice[];
    quotations: Quotation[];
    returns: ReturnType[];
    businessTransactions: BusinessTransaction[];
    activityLog: ActivityLogEntry[];
    appSettingsSnapshot: Omit<AppSettings, 'backupConfig'>; // Don't backup the backup config itself to avoid loops
  };
}

export interface BackupRecord { // For listing backups
  id: string;
  createdAt: string;
  description: string;
  version: number;
}
