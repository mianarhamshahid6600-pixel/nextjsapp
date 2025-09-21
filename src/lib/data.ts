

import type { Product, Customer, Sale, ActivityLogEntry, AppSettings, Supplier, PurchaseInvoice, Quotation, Return } from './data-types';

// Initial Data (Defaults if localStorage is empty)
export const initialProductsData: Product[] = [
  { id: "PROD001", productCode: "ASP100", name: "Aspirin 100mg", price: 5.99, costPrice: 3.50, stock: 150, lastUpdated: new Date().toISOString(), category: "Pain Relief", discountPercentage: 0 },
  { id: "PROD002", productCode: "VITC500", name: "Vitamin C 500mg", price: 12.50, costPrice: 7.00, stock: 80, lastUpdated: new Date().toISOString(), category: "Vitamins", discountPercentage: 5 }, // 5% discount
  { id: "PROD003", productCode: "PAR500", name: "Paracetamol 500mg", price: 4.75, costPrice: 2.80, stock: 200, lastUpdated: new Date().toISOString(), category: "Pain Relief" },
  { id: "PROD004", productCode: "COUGH01", name: "Cough Syrup", price: 8.00, costPrice: 4.50, stock: 30, lastUpdated: new Date().toISOString(), category: "Cold & Flu", discountPercentage: 10 }, // 10% discount
  { id: "PROD005", productCode: "BANDAID50", name: "Band-Aids (Box of 50)", price: 3.25, costPrice: 1.80, stock: 100, lastUpdated: new Date().toISOString(), category: "First Aid" },
];

export const initialCustomersData: Customer[] = [
  { id: "CUST_WALK_IN", name: "Walk-in Customer", phone: "N/A", joinedDate: new Date("2020-01-01").toISOString() },
  { id: "CUST001", name: "John Doe", phone: "555-1234", email: "john.doe@example.com", address: "123 Main St, Anytown, USA", joinedDate: new Date().toISOString() },
  { id: "CUST002", name: "Jane Smith", phone: "555-5678", email: "jane.smith@example.com", address: "456 Oak Ave, Anytown, USA", joinedDate: new Date().toISOString() },
];

export const initialSuppliersData: Supplier[] = [
];


export const initialSalesData: Sale[] = [];
export const initialPurchaseInvoicesData: PurchaseInvoice[] = [];
export const initialQuotationsData: Quotation[] = [];
export const initialReturnsData: Return[] = []; // Added for returns

export const initialActivityLogData: ActivityLogEntry[] = [
    {id: 'ACTINI001', timestamp: new Date().toISOString(), type: 'INVENTORY_UPDATE', description: 'Initial stock set for Aspirin 100mg', details: {productName: 'Aspirin 100mg', newStock: 150}},
];

export const initialAppSettings: AppSettings = {
  lowStockThreshold: 20,
  lastSaleNumericId: 0,
  lastCustomerNumericId: 0,
  lastPurchaseNumericId: 0,
  lastQuotationNumericId: 0,
  lastReturnNumericId: 0, 
  currency: 'PKR',
  hasCompletedInitialSetup: false,
  companyDisplayName: 'Salify',
  dateOfBirth: null,
  currentBusinessCash: 0,
  walkInCustomerDefaultName: "Walk-in Customer",
  knownCategories: [],
  knownShopNames: [],
  backupConfig: {
    autoBackupFrequency: 'disabled',
    lastManualBackupTimestamp: null,
    lastAutoBackupTimestamp: null,
  },
  obfuscationCharacter: '*',
  toastDuration: 1000,
  totalProducts: 0,
  totalSuppliers: 0,
};

    
