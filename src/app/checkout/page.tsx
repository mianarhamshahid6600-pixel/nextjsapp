
"use client";

import { useState, type FormEvent, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// RadioGroup removed as per request
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingBag, PlusCircle, Trash2, UserCircle, CreditCard, Loader2, Zap, RotateCcw, Building, Percent, Edit, Users, DollarSign, ListChecks, ScanLine, Edit2, Library, CheckCircle, Info, Printer, Download, Share2, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getProductsForUser, getProductByCodeForUser } from "@/lib/services/product-service";
import { getCustomersForUser } from "@/lib/services/customer-service";
import { processSaleForUser, type ProcessSaleInput, type ProcessInstantSaleInput, type ProcessRegularSaleInput, type Sale } from "@/lib/services/sale-service";
import type { Product, Customer, AppSettings } from "@/lib/data-types";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";
import { ProductSelectionDialog } from "@/components/shared/product-selection-dialog";
import { CustomerSelectionDialog } from "@/components/shared/customer-selection-dialog";
import { ShopNameManagementDialog } from "@/components/shared/shop-name-management-dialog";
import { updateAppSettingsInFirestore } from "@/lib/services/app-settings-service";
import { initialAppSettings } from "@/lib/data";
import { cn } from "@/lib/utils";
import { PrintableBill } from '@/components/shared/printable-bill';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


interface OrderItem {
  id: string;
  productCode?: string;
  name: string;
  orderQuantity: number;
  price: number;
  originalPrice?: number;
  itemDiscountPercentage?: number;
  total: number;
  costPrice?: number;
  isManualEntry?: boolean;
  stock?: number;
  category?: string;
}

type SaleMode = "REGULAR" | "INSTANT";
type CustomerStatus = 'new' | 'existing' | 'walk-in' | 'empty';


export default function CheckoutPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource, coreAppData, refreshAuthContext } = useAuth();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [saleMode, setSaleMode] = useState<SaleMode>("REGULAR");
  
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);

  const [inventoryItemProductCode, setInventoryItemProductCode] = useState<string>("");
  const [inventoryItemQuantity, setInventoryItemQuantity] = useState<string>("1");
  const [inventoryItemCostPrice, setInventoryItemCostPrice] = useState<string>("");
  const [inventoryItemSalePrice, setInventoryItemSalePrice] = useState<string>("");
  const [selectedProductForStockHint, setSelectedProductForStockHint] = useState<Product | null>(null);

  const [manualItemName, setManualItemName] = useState<string>("");
  const [manualItemQuantity, setManualItemQuantity] = useState<string>("1");
  const [manualItemCostPrice, setManualItemCostPrice] = useState<string>("");
  const [manualItemPrice, setManualItemPrice] = useState<string>("");

  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [manualCustomerInput, setManualCustomerInput] = useState<string>("");
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [highlightedCustomerSuggestionIndex, setHighlightedCustomerSuggestionIndex] = useState<number>(-1);
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>('empty');


  const [instantSaleCustomerShopName, setInstantSaleCustomerShopName] = useState<string>("");

  const [discountInput, setDiscountInput] = useState<string>("");
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);

  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [isProductSelectModalOpen, setIsProductSelectModalOpen] = useState(false);
  const [isCustomerSelectModalOpen, setIsCustomerSelectModalOpen] = useState(false);
  const [isFindingProduct, setIsFindingProduct] = useState(false);
  const [isShopNameManagerOpen, setIsShopNameManagerOpen] = useState(false);

  const [codeSuggestions, setCodeSuggestions] = useState<Product[]>([]);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);

  const [shopNameSuggestions, setShopNameSuggestions] = useState<string[]>([]);
  const [showShopNameSuggestions, setShowShopNameSuggestions] = useState(false);
  const [highlightedShopSuggestionIndex, setHighlightedShopSuggestionIndex] = useState<number>(-1);

  const productCodeInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const inventoryItemCostPriceRef = useRef<HTMLInputElement>(null);
  const inventoryItemSalePriceRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLFormElement>(null);
  const formRef = useRef<HTMLFormElement>(null);


  const manualItemNameInputRef = useRef<HTMLInputElement>(null);
  const manualItemQuantityInputRef = useRef<HTMLInputElement>(null);
  const manualItemCostPriceInputRef = useRef<HTMLInputElement>(null);
  const manualItemPriceInputRef = useRef<HTMLInputElement>(null);
  
  const instantShopNameInputRef = useRef<HTMLInputElement>(null);
  const manualCustomerNameInputRef = useRef<HTMLInputElement>(null);

  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [billImage, setBillImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);


  const handlePrint = () => {
    if (!billImage) return;
    const printWindow = window.open('', '_blank');
    printWindow?.document.write(`
        <html>
            <head><title>Print Receipt</title></head>
            <body style="margin: 0;">
                <img src="${billImage}" style="width: 100%;" onload="window.print(); window.close();" />
            </body>
        </html>
    `);
    printWindow?.document.close();
  };

  const handleDownloadPdf = () => {
    if (!billImage) {
        toast({ title: "Error", description: "Receipt image not generated.", variant: "destructive" });
        return;
    }
    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px', // Use pixels for easier scaling
        format: 'a4' // A standard format, will be cropped
    });

    const img = new Image();
    img.onload = function() {
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (this.height * pdfWidth) / this.width;
        pdf.addImage(this, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`invoice-${completedSale?.numericSaleId || 'receipt'}.pdf`);
    };
    img.src = billImage;
  };
  
  const handleShare = async () => {
    if (!billImage) {
        toast({ title: "Error", description: "Receipt image not available for sharing.", variant: "destructive" });
        return;
    }

    try {
        const response = await fetch(billImage);
        const blob = await response.blob();
        const file = new File([blob], `invoice-${completedSale?.numericSaleId}.png`, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: `Invoice #${completedSale?.numericSaleId}`,
                text: `Here is the invoice from ${appSettings.companyDisplayName || 'our store'}.`,
                files: [file],
            });
            toast({ title: "Shared!", description: "Invoice shared successfully." });
        } else {
             // Fallback for browsers that can't share files
            const message = generateWhatsAppMessage();
            window.open(`https://wa.me/?text=${message}`, '_blank');
        }
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error("Share failed:", error);
            const message = generateWhatsAppMessage();
            window.open(`https://wa.me/?text=${message}`, '_blank');
        }
    }
  };


 const resetCheckoutForm = useCallback(() => {
    setOrderItems([]);
    setInventoryItemProductCode("");
    setInventoryItemQuantity("1");
    setInventoryItemCostPrice("");
    setInventoryItemSalePrice("");
    setShowCodeSuggestions(false);
    setCodeSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    setSelectedProductForStockHint(null);
    setManualItemName("");
    setManualItemQuantity("1");
    setManualItemPrice("");
    setManualItemCostPrice("");

    setManualCustomerInput("");
    setShowCustomerSuggestions(false);
    setCustomerSuggestions([]);
    setHighlightedCustomerSuggestionIndex(-1);

    const walkInCustomer = availableCustomers.find(c => c.id === "CUST_WALK_IN");
    setSelectedCustomer(walkInCustomer ? "CUST_WALK_IN" : "");
    
    setInstantSaleCustomerShopName("");
    setShowShopNameSuggestions(false);
    setShopNameSuggestions([]);
    setHighlightedShopSuggestionIndex(-1);
    setDiscountInput("");
    setAppliedDiscount(0);
    
    setIsProcessingSale(false);
    if (manualCustomerNameInputRef.current) {
        manualCustomerNameInputRef.current.focus();
    } else if (productCodeInputRef.current) {
        productCodeInputRef.current.focus();
    }
  }, [availableCustomers]); 


  const fetchPageData = useCallback(async () => {
    if (!userId) {
      return;
    }
    try {
        const [productsData, customersData] = await Promise.all([
            getProductsForUser(userId),
            getCustomersForUser(userId)
        ]);
        setProducts(productsData);
        setCustomers(customersData);

        const allCust = [...customersData];
        let walkInExists = allCust.some(c => c.id === "CUST_WALK_IN");
        const walkInDisplayName = appSettings?.walkInCustomerDefaultName || initialAppSettings.walkInCustomerDefaultName || "Walk-in Customer";

        if (!walkInExists && appSettings) {
            const walkInPlaceholder: Customer = { id: "CUST_WALK_IN", name: walkInDisplayName, phone: "N/A", joinedDate: new Date().toISOString() };
            allCust.unshift(walkInPlaceholder);
            walkInExists = true;
        }
        
        if (walkInExists) {
            const walkIn = allCust.find(c => c.id === "CUST_WALK_IN");
            if (walkIn && walkIn.name !== walkInDisplayName) {
                walkIn.name = walkInDisplayName;
            }
        }
        setAvailableCustomers(allCust);
        if(allCust.length > 0 && !customers.length) {
            resetCheckoutForm();
        }
    } catch(err) {
        console.error("Error fetching checkout page data", err);
        toast({title: "Error", description: "Could not load products or customers.", variant: "destructive"});
    }
  // FIX: Removed resetCheckoutForm from dependency array to prevent infinite loop.
  }, [userId, appSettings, toast, customers.length]);

  useEffect(() => {
      if(!authLoading && userId && appSettings) {
          fetchPageData();
      }
  }, [authLoading, userId, appSettings, fetchPageData]);


 useEffect(() => {
    const code = inventoryItemProductCode.trim();
    if (code === "") {
      setCodeSuggestions([]);
      setShowCodeSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      setSelectedProductForStockHint(null);
      setInventoryItemCostPrice("");
      setInventoryItemSalePrice("");
      return;
    }

    const lowerCaseInput = code.toLowerCase();
    const filtered = products.filter(p =>
      p.productCode.toLowerCase().includes(lowerCaseInput) ||
      p.name.toLowerCase().includes(lowerCaseInput)
    );
    setCodeSuggestions(filtered.slice(0, 7));
    setHighlightedSuggestionIndex(filtered.length > 0 ? 0 : -1);

    const exactCodeMatch = products.find(p => p.productCode.toLowerCase() === lowerCaseInput);
    if (exactCodeMatch) {
      setSelectedProductForStockHint(exactCodeMatch);
      setInventoryItemCostPrice((exactCodeMatch.costPrice || 0).toString());
      setInventoryItemSalePrice(exactCodeMatch.price.toString());
    } else {
      if (filtered.length === 1 && filtered[0].name.toLowerCase() === lowerCaseInput) {
        setSelectedProductForStockHint(filtered[0]);
        setInventoryItemCostPrice((filtered[0].costPrice || 0).toString());
        setInventoryItemSalePrice(filtered[0].price.toString());
      } else {
         setSelectedProductForStockHint(null);
         setInventoryItemCostPrice("");
         setInventoryItemSalePrice("");
      }
    }

    if (filtered.length > 0 && document.activeElement === productCodeInputRef.current) {
        setShowCodeSuggestions(true);
    } else if (filtered.length === 0) {
        setShowCodeSuggestions(false);
    }
  }, [inventoryItemProductCode, products]);

  useEffect(() => { 
    if (!appSettings?.knownShopNames || saleMode !== "INSTANT") {
      setShopNameSuggestions([]);
      setShowShopNameSuggestions(false);
      return;
    }
    const input = instantSaleCustomerShopName.trim().toLowerCase();
    if (input === "") {
      setShopNameSuggestions([]);
      setShowShopNameSuggestions(false);
      setHighlightedShopSuggestionIndex(-1);
      return;
    }
    const filtered = appSettings.knownShopNames.filter(name =>
      name.toLowerCase().includes(input)
    );
    setShopNameSuggestions(filtered.slice(0, 7));
    setHighlightedShopSuggestionIndex(filtered.length > 0 ? 0 : -1);

    if (filtered.length > 0 && document.activeElement === instantShopNameInputRef.current) {
        setShowShopNameSuggestions(true);
    } else if (filtered.length === 0) {
        setShowShopNameSuggestions(false);
    }
  }, [instantSaleCustomerShopName, appSettings?.knownShopNames, saleMode]);

  const handleSuggestionClick = (product: Product) => {
    setInventoryItemProductCode(product.productCode);
    setSelectedProductForStockHint(product);
    setInventoryItemQuantity("1");
    setInventoryItemCostPrice((product.costPrice || 0).toString());
    setInventoryItemSalePrice(product.price.toString());
    setShowCodeSuggestions(false);
    setCodeSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    quantityInputRef.current?.focus();
    quantityInputRef.current?.select();
  };

  const handleShopNameSuggestionClick = (shopName: string) => {
    setInstantSaleCustomerShopName(shopName);
    setShowShopNameSuggestions(false);
    setShopNameSuggestions([]);
    setHighlightedShopSuggestionIndex(-1);
    productCodeInputRef.current?.focus();
  };

  const handleProductCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && orderItems.length > 0 && discountInputRef.current) {
      e.preventDefault();
      discountInputRef.current.focus();
      discountInputRef.current.select();
      return;
    }
    if (showCodeSuggestions && codeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => (prev + 1) % codeSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedSuggestionIndex(prev => (prev - 1 + codeSuggestions.length) % codeSuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < codeSuggestions.length) {
          handleSuggestionClick(codeSuggestions[highlightedSuggestionIndex]);
        } else if (codeSuggestions.length > 0 && codeSuggestions.length === 1) {
           handleSuggestionClick(codeSuggestions[0]);
        } else {
           quantityInputRef.current?.focus();
           quantityInputRef.current?.select();
        }
      } else if (e.key === 'Escape') {
        setShowCodeSuggestions(false);
        setHighlightedSuggestionIndex(-1);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    }
  };

  const handleShopNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showShopNameSuggestions && shopNameSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedShopSuggestionIndex(prev => (prev + 1) % shopNameSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedShopSuggestionIndex(prev => (prev - 1 + shopNameSuggestions.length + shopNameSuggestions.length) % shopNameSuggestions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedShopSuggestionIndex >= 0 && highlightedShopSuggestionIndex < shopNameSuggestions.length) {
                handleShopNameSuggestionClick(shopNameSuggestions[highlightedShopSuggestionIndex]);
            } else if (shopNameSuggestions.length === 1) {
                handleShopNameSuggestionClick(shopNameSuggestions[0]);
            }
            productCodeInputRef.current?.focus();
        } else if (e.key === 'Escape') {
            setShowShopNameSuggestions(false);
            setHighlightedShopSuggestionIndex(-1);
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        productCodeInputRef.current?.focus();
    }
};


  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductForStockHint) {
        inventoryItemCostPriceRef.current?.focus();
        inventoryItemCostPriceRef.current?.select();
      } else {
         handleAddProductToOrder();
      }
    }
  };

  const handleInventoryItemCostPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inventoryItemSalePriceRef.current?.focus();
      inventoryItemSalePriceRef.current?.select();
    }
  };

  const handleInventoryItemSalePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddProductToOrder();
    }
  };


  const handleManualItemNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualItemQuantityInputRef.current?.focus();
    }
  };

  const handleManualItemQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualItemCostPriceInputRef.current?.focus();
    }
  };

  const handleManualItemCostPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualItemPriceInputRef.current?.focus();
    }
  };

  const handleManualItemPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddManualItemToOrder();
    }
  };

  const handleOrderItemDiscountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur(); 
    }
  };

  const handleDiscountInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyDiscount(); 

      const customerInfoProvided = 
        (!selectedCustomer || selectedCustomer === "CUST_WALK_IN") ? !!manualCustomerInput.trim() : !!selectedCustomer;


      if (orderItems.length > 0) { // Customer name no longer required to process sale
        if (formRef.current) {
          formRef.current.requestSubmit(); 
        }
      } else {
        toast({ title: "Cannot Process Sale", description: "Please ensure order items are added.", variant: "destructive"});
      }
    }
  };

  useEffect(() => {
    const input = manualCustomerInput.trim().toLowerCase();
    const walkInDefaultName = (appSettings?.walkInCustomerDefaultName || "Walk-in Customer").toLowerCase();
    
    if (!input) {
      setCustomerStatus('empty');
      return;
    }

    if (input === walkInDefaultName) {
      setCustomerStatus('walk-in');
      return;
    }

    const existingCustomer = availableCustomers.find(c => c.name.toLowerCase() === input);
    if (existingCustomer) {
      setCustomerStatus('existing');
      setSelectedCustomer(existingCustomer.id);
    } else {
      setCustomerStatus('new');
      setSelectedCustomer("CUST_WALK_IN"); 
    }
  }, [manualCustomerInput, availableCustomers, appSettings?.walkInCustomerDefaultName]);


  useEffect(() => {
    const nameInput = manualCustomerInput.trim();
    if (nameInput === "") { 
      setCustomerSuggestions([]);
      setShowCustomerSuggestions(false);
      setHighlightedCustomerSuggestionIndex(-1);
      return;
    }

    const lowerCaseInput = nameInput.toLowerCase();
    const filtered = availableCustomers.filter(c =>
      c.id !== "CUST_WALK_IN" && ( 
        c.name.toLowerCase().includes(lowerCaseInput) ||
        (c.phone && c.phone.includes(lowerCaseInput))
      )
    );
    setCustomerSuggestions(filtered.slice(0, 5));
    setHighlightedCustomerSuggestionIndex(filtered.length > 0 ? 0 : -1);

    if (filtered.length > 0 && document.activeElement === manualCustomerNameInputRef.current) {
        setShowCustomerSuggestions(true);
    } else if (filtered.length === 0) {
        setShowCustomerSuggestions(false);
    }
  }, [manualCustomerInput, availableCustomers]); 

  const handleCustomerSuggestionClick = (customer: Customer) => {
    setManualCustomerInput(customer.name);
    setSelectedCustomer(customer.id);
    setShowCustomerSuggestions(false);
    setCustomerSuggestions([]);
    setHighlightedCustomerSuggestionIndex(-1);
    // Auto-scroll and focus
    if (productCodeInputRef.current) {
      productCodeInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        productCodeInputRef.current?.focus();
        productCodeInputRef.current?.select();
      }, 300); // Small delay to allow scroll to finish
    }
  };

  const handleManualCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCustomerSuggestions && customerSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedCustomerSuggestionIndex(prev => (prev + 1) % customerSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedCustomerSuggestionIndex(prev => (prev - 1 + customerSuggestions.length) % customerSuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedCustomerSuggestionIndex >= 0 && highlightedCustomerSuggestionIndex < customerSuggestions.length) {
          handleCustomerSuggestionClick(customerSuggestions[highlightedCustomerSuggestionIndex]);
        } else if (customerSuggestions.length === 1) {
           handleCustomerSuggestionClick(customerSuggestions[0]);
        } else {
            setShowCustomerSuggestions(false);
            productCodeInputRef.current?.focus();
            productCodeInputRef.current?.select();
        }
      } else if (e.key === 'Escape') {
        setShowCustomerSuggestions(false);
        setHighlightedCustomerSuggestionIndex(-1);
      }
    } else if (e.key === 'Enter') { 
        e.preventDefault();
        setShowCustomerSuggestions(false);
        productCodeInputRef.current?.focus();
        productCodeInputRef.current?.select();
    }
  };

  const subTotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + item.total, 0);
  }, [orderItems]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subTotal - appliedDiscount);
  }, [subTotal, appliedDiscount]);


  const handleApplyDiscount = () => {
    const numDiscount = parseFloat(discountInput);
    if (isNaN(numDiscount) || numDiscount < 0) {
      setAppliedDiscount(0);
      setDiscountInput("0");
      return;
    }
    if (numDiscount > subTotal) {
      toast({ title: "Invalid Discount", description: `Discount cannot exceed subtotal of ${formatCurrency(subTotal, appSettings.currency, currencyForConversionSource)}.`, variant: "destructive" });
      setAppliedDiscount(subTotal);
      setDiscountInput(subTotal.toString());
      return;
    }
    setAppliedDiscount(numDiscount);
    toast({ title: "Discount Applied", description: `Discount of ${formatCurrency(numDiscount, appSettings.currency, currencyForConversionSource)} applied.`, variant: "default" });
  };


  const handleAddProductToOrder = async () => {
    const productCode = inventoryItemProductCode.trim();
    const numQuantity = parseInt(inventoryItemQuantity, 10);
    const numCostPrice = parseFloat(inventoryItemCostPrice);
    const numSalePrice = parseFloat(inventoryItemSalePrice);

    if (!selectedProductForStockHint && !productCode) {
      toast({ title: "Product Required", description: "Please select a product or enter its code.", variant: "destructive" });
      productCodeInputRef.current?.focus();
      return;
    }
    if (isNaN(numQuantity) || numQuantity <= 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid quantity.", variant: "destructive" });
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
      return;
    }
     if (isNaN(numCostPrice) || numCostPrice < 0) {
      toast({ title: "Invalid Cost Price", description: "Please enter a valid cost price (0 or more).", variant: "destructive"});
      inventoryItemCostPriceRef.current?.focus();
      inventoryItemCostPriceRef.current?.select();
      return;
    }
    if (isNaN(numSalePrice) || numSalePrice <= 0) {
      toast({ title: "Invalid Sale Price", description: "Please enter a valid sale price (greater than 0).", variant: "destructive"});
      inventoryItemSalePriceRef.current?.focus();
      inventoryItemSalePriceRef.current?.select();
      return;
    }
    if (!userId) return;

    setIsFindingProduct(true);
    try {
      const productToAdd = selectedProductForStockHint || await getProductByCodeForUser(userId, productCode);
      if (!productToAdd) {
        toast({ title: "Product Not Found", description: `Product with code "${productCode}" not found. Try searching by name or re-select.`, variant: "destructive" });
        setIsFindingProduct(false);
        productCodeInputRef.current?.focus();
        productCodeInputRef.current?.select();
        setSelectedProductForStockHint(null);
        setInventoryItemCostPrice("");
        setInventoryItemSalePrice("");
        return;
      }

      const existingItem = orderItems.find(item => item.id === productToAdd.id && !item.isManualEntry);
      const currentOrderQuantity = existingItem ? existingItem.orderQuantity : 0;

      if ((currentOrderQuantity + numQuantity) > productToAdd.stock) {
        toast({ title: "Insufficient Stock", description: `Not enough stock for ${productToAdd.name}. Available: ${productToAdd.stock - currentOrderQuantity}`, variant: "destructive" });
        setIsFindingProduct(false);
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
        return;
      }

      const overriddenOriginalSalePrice = numSalePrice;
      let itemDiscountPercentageFromProduct: number = productToAdd.discountPercentage || 0;

      const discountAmountFromProductPercentage = overriddenOriginalSalePrice * (itemDiscountPercentageFromProduct / 100);
      const finalPricePerUnitAfterProductDiscount = overriddenOriginalSalePrice - discountAmountFromProductPercentage;

      setOrderItems(prevItems => {
        if (existingItem) {
           return prevItems.map(item =>
            item.id === productToAdd.id && !item.isManualEntry
              ? { ...item,
                  orderQuantity: item.orderQuantity + numQuantity,
                  originalPrice: overriddenOriginalSalePrice, 
                  price: finalPricePerUnitAfterProductDiscount, 
                  costPrice: numCostPrice,
                  itemDiscountPercentage: itemDiscountPercentageFromProduct, 
                  total: finalPricePerUnitAfterProductDiscount * (item.orderQuantity + numQuantity)
                }
              : item
          );
        } else {
          return [...prevItems, {
            ...productToAdd,
            originalPrice: overriddenOriginalSalePrice, 
            itemDiscountPercentage: itemDiscountPercentageFromProduct, 
            price: finalPricePerUnitAfterProductDiscount, 
            costPrice: numCostPrice,
            orderQuantity: numQuantity,
            total: finalPricePerUnitAfterProductDiscount * numQuantity,
            isManualEntry: false
          }];
        }
      });

      setInventoryItemProductCode("");
      setInventoryItemQuantity("1");
      setInventoryItemCostPrice("");
      setInventoryItemSalePrice("");
      setSelectedProductForStockHint(null);
      setShowCodeSuggestions(false);
      setCodeSuggestions([]);
      setHighlightedSuggestionIndex(-1);
      toast({ title: "Item Added", description: `${productToAdd.name} (Code: ${productToAdd.productCode}) added to order.` });
      productCodeInputRef.current?.focus();
    } catch (error) {
      console.error("Error adding product to order:", error);
      toast({ title: "Error Adding Item", description: "Failed to add product to order.", variant: "destructive" });
      setSelectedProductForStockHint(null);
      setInventoryItemCostPrice("");
      setInventoryItemSalePrice("");
    } finally {
      setIsFindingProduct(false);
    }
  };


  const handleAddManualItemToOrder = () => {
    const name = manualItemName.trim();
    const numQuantity = parseInt(manualItemQuantity, 10);
    const numSalePrice = parseFloat(manualItemPrice);
    const numCostPrice = parseFloat(manualItemCostPrice) || 0;

    if (!name) {
      toast({ title: "Item Name Required", description: "Manual item name is required.", variant: "destructive" });
      manualItemNameInputRef.current?.focus();
      return;
    }
    if (isNaN(numQuantity) || numQuantity <= 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid quantity for the manual item.", variant: "destructive" });
      return;
    }
    if (isNaN(numSalePrice) || numSalePrice <= 0) {
      toast({ title: "Invalid Sale Price", description: "Please enter a valid sale price for the manual item.", variant: "destructive" });
      return;
    }
     if (isNaN(numCostPrice) || numCostPrice < 0) {
      toast({ title: "Invalid Cost Price", description: "Please enter a valid non-negative cost price or leave blank for 0.", variant: "destructive" });
      return;
    }

    const manualOrderItem: OrderItem = {
      id: `MANUAL_${Date.now()}`,
      name: name,
      orderQuantity: numQuantity,
      price: numSalePrice,
      originalPrice: numSalePrice, 
      itemDiscountPercentage: 0, 
      total: numSalePrice * numQuantity,
      costPrice: numCostPrice,
      isManualEntry: true,
    };

    setOrderItems(prevItems => [...prevItems, manualOrderItem]);
    setManualItemName("");
    setManualItemQuantity("1");
    setManualItemPrice("");
    setManualItemCostPrice("");
    toast({ title: "Manual Item Added", description: `${name} added to order.` });
    manualItemNameInputRef.current?.focus();
  };

  const handleItemDiscountChange = (itemId: string, newDiscountStr: string) => {
    setOrderItems(prevItems =>
      prevItems.map(item => {
        if (item.id === itemId && item.originalPrice !== undefined && !item.isManualEntry) {
          let newDiscountPercentage = parseFloat(newDiscountStr);
          if (isNaN(newDiscountPercentage) || newDiscountPercentage < 0) {
            newDiscountPercentage = 0;
          } else if (newDiscountPercentage > 100) {
            newDiscountPercentage = 100;
          }

          const discountAmount = item.originalPrice * (newDiscountPercentage / 100);
          const newPrice = item.originalPrice - discountAmount;
          const newTotal = newPrice * item.orderQuantity;

          return {
            ...item,
            itemDiscountPercentage: newDiscountPercentage,
            price: newPrice,
            total: newTotal,
          };
        }
        return item;
      })
    );
    toast({ title: "Item Discount Updated", description: "Discount for the item has been adjusted.", variant: "default" });
  };


  const handleRemoveItem = (itemId: string) => {
    setOrderItems(prevItems => prevItems.filter(item => item.id !== itemId));
    toast({ title: "Item Removed", description: `Item removed from order.` });
  };

  const handleProcessSale = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !appSettings) {
      toast({ title: "Authentication Error", description: "You must be logged in and settings loaded to process a sale.", variant: "destructive" });
      return;
    }
    if (orderItems.length === 0) {
        toast({ title: "Empty Order", description: "Order is empty. Add products to proceed.", variant: "destructive" });
        return;
    }
    setIsProcessingSale(true);

    let finalCustomerId: string = "";
    let finalCustomerName: string = "";
    const manuallyTypedName = manualCustomerInput.trim();
    const isPhoneNumber = /^\d[\d\s-]*\d$/.test(manuallyTypedName);

    if (selectedCustomer && selectedCustomer !== "CUST_WALK_IN") {
        const custDetails = availableCustomers.find(c => c.id === selectedCustomer);
        if (custDetails) {
            finalCustomerId = selectedCustomer;
            finalCustomerName = (manuallyTypedName && custDetails.name.toLowerCase() === manuallyTypedName.toLowerCase()) ? manuallyTypedName : custDetails.name;
        }
    }
    
    if (!finalCustomerId && manuallyTypedName) {
        const matchedCustomer = availableCustomers.find(c =>
            c.id !== "CUST_WALK_IN" &&
            (c.name.toLowerCase() === manuallyTypedName.toLowerCase() || (c.phone && c.phone === manuallyTypedName))
        );
        if (matchedCustomer) {
            finalCustomerId = matchedCustomer.id;
            finalCustomerName = matchedCustomer.name;
        }
    }

    if (!finalCustomerId) {
        finalCustomerId = "CUST_WALK_IN";
        finalCustomerName = isPhoneNumber ? "Cash" : (manuallyTypedName ? manuallyTypedName : (appSettings.walkInCustomerDefaultName || "Walk-in Customer"));
    }

    if (!finalCustomerName.trim()){ 
        finalCustomerName = appSettings.walkInCustomerDefaultName || "Walk-in Customer";
    }

    let saleInput: ProcessSaleInput;
    let saleDescriptionForToast = "";

    const currentSubTotal = subTotal;
    const calculatedEstimatedTotalCogs = orderItems.reduce((sum, item) => sum + (item.costPrice || 0) * item.orderQuantity, 0);

    const saleItemsForService = orderItems.map(item => ({
        productId: item.isManualEntry ? "MANUAL_ENTRY" : item.id,
        productCode: item.isManualEntry ? undefined : item.productCode,
        productName: item.name,
        quantity: item.orderQuantity,
        price: item.price, 
        originalPriceBeforeItemDiscount: item.originalPrice, 
        itemDiscountAppliedPercentage: item.itemDiscountPercentage, 
        costPrice: item.costPrice || 0,
        total: item.total,
    }));

    if (saleMode === "REGULAR") {
      saleInput = {
        saleType: "REGULAR",
        customerId: finalCustomerId, 
        customerName: finalCustomerName,
        itemsToSell: saleItemsForService,
        subTotal: currentSubTotal,
        discountAmount: appliedDiscount > 0 ? appliedDiscount : undefined,
        estimatedTotalCogs: calculatedEstimatedTotalCogs,
      } as ProcessRegularSaleInput;
      saleDescriptionForToast = `Regular Order for ${finalCustomerName || 'N/A'} total: ${formatCurrency(grandTotal, appSettings.currency, currencyForConversionSource)}.`;

    } else { 
      const shopNameToSave = instantSaleCustomerShopName.trim();
      const instantSalePayload: Partial<ProcessInstantSaleInput> = {
          estimatedTotalCogs: calculatedEstimatedTotalCogs,
          customerId: finalCustomerId, 
          customerName: finalCustomerName,
      };
      if (shopNameToSave) instantSalePayload.shopName = shopNameToSave;

      saleInput = {
          saleType: "INSTANT",
          ...instantSalePayload,
          itemsToSell: saleItemsForService,
          subTotal: currentSubTotal,
          discountAmount: appliedDiscount > 0 ? appliedDiscount : undefined,
      } as ProcessInstantSaleInput;
      saleDescriptionForToast = `Instant Order for ${finalCustomerName || 'N/A'}${shopNameToSave ? ` (${shopNameToSave})` : ''} total: ${formatCurrency(grandTotal, appSettings.currency, currencyForConversionSource)}.`;
      
      if (shopNameToSave && !appSettings.knownShopNames?.map(s => s.toLowerCase()).includes(shopNameToSave.toLowerCase())) {
        const updatedKnownShopNames = [...(appSettings.knownShopNames || []), shopNameToSave].sort((a, b) => a.localeCompare(b));
        await updateAppSettingsInFirestore(userId, appSettings, { knownShopNames: updatedKnownShopNames });
      }
    }

    try {
      const { newSale, newlyCreatedCustomer, updatedProducts } = await processSaleForUser(userId, saleInput);
      toast({ title: "Sale Processed!", description: `${saleDescriptionForToast} Order #${newSale.numericSaleId}. Thank you!` });
      
      setCompletedSale(newSale); 
      
      setProducts(prevProducts => {
        const updatedProductMap = new Map(prevProducts.map(p => [p.id, p]));
        updatedProducts.forEach(up => {
            updatedProductMap.set(up.id, up);
        });
        return Array.from(updatedProductMap.values());
      });
      
      if (newlyCreatedCustomer) {
        setCustomers(prev => [...prev, newlyCreatedCustomer]);
      }
      setShowPrintModal(true); 
      
    } catch (error: any) {
       toast({ title: "Error Processing Sale", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
        setIsProcessingSale(false);
    }
  };

  const handleSaleModeChange = (newMode: SaleMode) => {
    setSaleMode(newMode);
    resetCheckoutForm(); 
  };


  const handleProductDialogSelect = (product: Product) => {
    setInventoryItemProductCode(product.productCode);
    setSelectedProductForStockHint(product);
    setInventoryItemQuantity("1");
    setInventoryItemCostPrice((product.costPrice || 0).toString());
    setInventoryItemSalePrice(product.price.toString());
    setIsProductSelectModalOpen(false);
    quantityInputRef.current?.focus();
    quantityInputRef.current?.select();
  };

  const handleCustomerDialogSelect = (customer: Customer) => {
    setSelectedCustomer(customer.id);
    setManualCustomerInput(customer.name); 
    setIsCustomerSelectModalOpen(false);
    // Auto-scroll and focus
    if (productCodeInputRef.current) {
        productCodeInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          productCodeInputRef.current?.focus();
          productCodeInputRef.current?.select();
        }, 300); // Small delay to allow scroll to finish
    }
  };
  
  const handleShopNameDialogSelect = (shopName: string) => {
    setInstantSaleCustomerShopName(shopName);
    setIsShopNameManagerOpen(false);
  };


  useEffect(() => {
    if (completedSale) {
        setIsGeneratingImage(true);
        // Timeout to allow DOM to update for the hidden bill to render
        setTimeout(() => {
            const billElement = printRef.current;
            if (billElement) {
                html2canvas(billElement, { scale: 3, backgroundColor: '#ffffff', useCORS: true })
                    .then(canvas => {
                        setBillImage(canvas.toDataURL('image/png', 1.0));
                        setIsGeneratingImage(false);
                    })
                    .catch(err => {
                        console.error("Error generating bill image:", err);
                        toast({ title: "Image Error", description: "Could not generate receipt image.", variant: "destructive"});
                        setIsGeneratingImage(false);
                    });
            }
        }, 100);
    }
  }, [completedSale, toast]);


  if (authLoading || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
   if (!user) {
    return <p className="text-center text-lg">Please log in to access the checkout.</p>;
  }

  const selectableRegisteredCustomers = availableCustomers.filter(c => c.id !== "CUST_WALK_IN");

  const renderCustomerStatus = () => {
    switch (customerStatus) {
      case 'existing':
        return (
          <div className="mt-2 flex items-center text-sm text-green-600">
            <CheckCircle className="mr-2 h-4 w-4" />
            <span>Existing customer selected.</span>
          </div>
        );
      case 'new':
        return (
          <div className="mt-2 flex items-center text-sm text-blue-600">
            <Info className="mr-2 h-4 w-4" />
            <span>New customer will be created on sale completion.</span>
          </div>
        );
      case 'walk-in':
        return (
            <div className="mt-2 flex items-center text-sm text-gray-500">
              <UserCircle className="mr-2 h-4 w-4" />
              <span>Default walk-in customer.</span>
            </div>
          );
      case 'empty':
      default:
        return null;
    }
  };

  const generateWhatsAppMessage = () => {
      if (!completedSale || !appSettings) return "";
      let message = `*Invoice from ${appSettings.companyDisplayName || 'Our Store'}*\n\n`;
      message += `Invoice #: ${completedSale.numericSaleId}\n`;
      message += `Date: ${new Date(completedSale.saleDate).toLocaleDateString()}\n\n`;
      message += `*Items:*\n`;
      completedSale.items.forEach(item => {
          message += `- ${item.productName} (x${item.quantity}) - ${formatCurrency(item.total, appSettings.currency, currencyForConversionSource)}\n`;
      });
      message += `\n*Subtotal:* ${formatCurrency(completedSale.subTotal, appSettings.currency, currencyForConversionSource)}\n`;
      if (completedSale.discountAmount && completedSale.discountAmount > 0) {
          message += `*Discount:* -${formatCurrency(completedSale.discountAmount, appSettings.currency, currencyForConversionSource)}\n`;
      }
      message += `*Grand Total:* *${formatCurrency(completedSale.grandTotal, appSettings.currency, currencyForConversionSource)}*\n\n`;
      message += `Thank you for your business!`;
      return encodeURIComponent(message);
  };


  return (
    <div className="flex flex-col gap-6">
       {/* Hidden printable component, always in DOM when sale is completed */}
       {completedSale && (
            <div className="printable-bill-container fixed -left-[9999px] top-0 opacity-0 pointer-events-none">
                <PrintableBill ref={printRef} saleData={completedSale} appSettings={appSettings} />
            </div>
       )}

       {appSettings && (
        <>
          <ProductSelectionDialog
            isOpen={isProductSelectModalOpen}
            onOpenChange={setIsProductSelectModalOpen}
            products={products}
            appSettings={appSettings}
            onProductSelect={handleProductDialogSelect}
            context="checkout"
          />
          <CustomerSelectionDialog
            isOpen={isCustomerSelectModalOpen}
            onOpenChange={setIsCustomerSelectModalOpen}
            customers={availableCustomers.filter(c => c.id !== "CUST_WALK_IN")}
            onCustomerSelect={handleCustomerDialogSelect}
          />
          <ShopNameManagementDialog
            isOpen={isShopNameManagerOpen}
            onOpenChange={setIsShopNameManagerOpen}
            appSettings={appSettings}
            onSelectShopName={handleShopNameDialogSelect}
            onShopNamesUpdated={() => refreshAuthContext(true)}
          />
           <Dialog open={showPrintModal} onOpenChange={(open) => {
                if (!open) {
                    setShowPrintModal(false);
                    resetCheckoutForm();
                    setCompletedSale(null);
                    setBillImage(null);
                }
            }}>
                <DialogContent 
                    className="sm:max-w-md" 
                    onPointerDownOutside={(e) => e.preventDefault()} 
                    onEscapeKeyDown={(e) => {
                         e.preventDefault();
                         setShowPrintModal(false);
                         resetCheckoutForm();
                         setCompletedSale(null);
                         setBillImage(null);
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center"><CheckCircle className="mr-2 h-5 w-5 text-green-500" />Sale Completed!</DialogTitle>
                        <DialogDescription>Invoice #{completedSale?.numericSaleId} processed successfully. What would you like to do next?</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                         <div className="border p-2 rounded-md bg-muted/30 max-h-60 overflow-y-auto">
                            {isGeneratingImage ? (
                                <div className="flex items-center justify-center h-40">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary"/>
                                    <p className="ml-2">Generating Receipt...</p>
                                </div>
                            ) : billImage ? (
                                <img src={billImage} alt="Receipt Preview" className="w-full"/>
                            ) : (
                                <p className="text-destructive text-center">Could not generate receipt image.</p>
                            )}
                        </div>
                        
                        <Button onClick={handlePrint} className="w-full" disabled={!billImage || isGeneratingImage}>
                            <Printer className="mr-2 h-4 w-4"/> Print Receipt
                        </Button>
                        <Button onClick={handleDownloadPdf} className="w-full" variant="secondary" disabled={!billImage || isGeneratingImage}>
                            <Download className="mr-2 h-4 w-4"/> Download PDF
                        </Button>
                        <Button onClick={handleShare} className="w-full bg-green-600 hover:bg-green-700" disabled={!billImage || isGeneratingImage}>
                          <Share2 className="mr-2 h-4 w-4"/> Share
                        </Button>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Close & New Sale</Button></DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
      )}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Sale Mode</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            variant={saleMode === "REGULAR" ? "default" : "outline"}
            onClick={() => handleSaleModeChange("REGULAR")}
            className="flex-1 py-3 text-base"
          >
            <RotateCcw className="mr-2 h-5 w-5" /> Regular Sale
          </Button>
          <Button
            variant={saleMode === "INSTANT" ? "default" : "outline"}
            onClick={() => handleSaleModeChange("INSTANT")}
            className="flex-1 py-3 text-base"
          >
            <Zap className="mr-2 h-5 w-5" /> Instant Sale
          </Button>
        </CardContent>
      </Card>

      <form ref={formRef} onSubmit={handleProcessSale}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {(saleMode === "REGULAR" || saleMode === "INSTANT") && (
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="font-headline text-xl flex items-center"><UserCircle className="mr-2 h-5 w-5 text-primary" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    
                    <div className="relative">
                        <Label htmlFor="manualCustomerInput">Customer Name or Phone</Label>
                        <div className="flex items-center gap-2 mt-1">
                            <Input
                                ref={manualCustomerNameInputRef}
                                id="manualCustomerInput"
                                value={manualCustomerInput}
                                onChange={e => {setManualCustomerInput(e.target.value); if (selectedCustomer !== "CUST_WALK_IN" && !availableCustomers.find(c => c.id === selectedCustomer && c.name.toLowerCase() === e.target.value.toLowerCase())) {setSelectedCustomer("CUST_WALK_IN")};}}
                                onFocus={() => { if (manualCustomerInput.trim() && customerSuggestions.length > 0) setShowCustomerSuggestions(true); }}
                                onBlur={() => { setTimeout(() => setShowCustomerSuggestions(false), 150); }}
                                onKeyDown={handleManualCustomerKeyDown}
                                className="flex-grow"
                                disabled={isProcessingSale}
                                autoComplete="off"
                                placeholder="Name or Phone"
                            />
                            <Button type="button" variant="outline" size="icon" onClick={() => setIsCustomerSelectModalOpen(true)} className="h-10 w-10 flex-shrink-0" title="Search Customers List" disabled={selectableRegisteredCustomers.length === 0 || isProcessingSale}>
                                <Users className="h-5 w-5"/>
                            </Button>
                        </div>
                        {renderCustomerStatus()}
                        {showCustomerSuggestions && customerSuggestions.length > 0 && (
                            <div className="absolute top-full z-20 w-[calc(100%-3.5rem)] bg-card border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                            {customerSuggestions.map((cust, index) => (
                                <div
                                key={cust.id}
                                className={cn(
                                    "p-2 cursor-pointer",
                                    index === highlightedCustomerSuggestionIndex ? "bg-muted-foreground/20" : "hover:bg-muted"
                                )}
                                onMouseDown={() => handleCustomerSuggestionClick(cust)}
                                >
                                <p className="font-medium">{cust.name}</p>
                                <p className="text-sm text-muted-foreground">{cust.phone || "No phone"}</p>
                                </div>
                            ))}
                            </div>
                        )}
                    </div>

                    {saleMode === "INSTANT" && (
                        <div className="mt-3">
                            <Label htmlFor="instantShopNameContext">Shop Name (Optional)</Label>
                             <div className="flex items-center gap-2 relative">
                                <Input
                                    ref={instantShopNameInputRef}
                                    id="instantShopNameContext"
                                    value={instantSaleCustomerShopName}
                                    onChange={e => setInstantSaleCustomerShopName(e.target.value)}
                                    onFocus={() => { if (instantSaleCustomerShopName.trim() && shopNameSuggestions.length > 0) setShowShopNameSuggestions(true); }}
                                    onBlur={() => { setTimeout(() => setShowShopNameSuggestions(false), 150); }}
                                    onKeyDown={handleShopNameKeyDown}
                                    className="mt-1 flex-grow"
                                    disabled={isProcessingSale}
                                    autoComplete="off"
                                />
                                <Button type="button" variant="outline" size="icon" onClick={() => setIsShopNameManagerOpen(true)} className="mt-1 h-10 w-10 flex-shrink-0" title="Manage Shop Names" disabled={isProcessingSale}>
                                    <Library className="h-5 w-5"/>
                                </Button>
                                {showShopNameSuggestions && shopNameSuggestions.length > 0 && (
                                    <div className="absolute top-full z-20 w-[calc(100%-3.5rem)] bg-card border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                                    {shopNameSuggestions.map((name, index) => (
                                        <div
                                        key={name}
                                        className={cn(
                                            "p-2 cursor-pointer",
                                            index === highlightedShopSuggestionIndex ? "bg-muted-foreground/20" : "hover:bg-muted"
                                        )}
                                        onMouseDown={() => handleShopNameSuggestionClick(name)}
                                        >
                                        <p className="font-medium">{name}</p>
                                        </div>
                                    ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
              </Card>
            )}

            {saleMode === 'REGULAR' && (
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="font-headline text-xl flex items-center">
                      <ShoppingBag className="mr-2 h-5 w-5 text-primary" />
                      Add Products from Inventory
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4 items-end">
                    <div className="flex-grow relative">
                      <Label htmlFor="inventoryItemProductCode" className="flex items-center"><ScanLine className="mr-2 h-4 w-4 text-muted-foreground" />Product Code or Name</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          ref={productCodeInputRef}
                          id="inventoryItemProductCode"
                          value={inventoryItemProductCode}
                          onChange={e => setInventoryItemProductCode(e.target.value.toUpperCase())}
                          onFocus={() => {
                              if (inventoryItemProductCode.trim() && codeSuggestions.length > 0) {
                                setShowCodeSuggestions(true);
                              }
                            }}
                          onBlur={() => {
                              setTimeout(() => {
                                setShowCodeSuggestions(false);
                              }, 150);
                            }}
                          onKeyDown={handleProductCodeKeyDown}
                          className="flex-grow"
                          disabled={isFindingProduct || isProcessingSale}
                          autoComplete="off"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => setIsProductSelectModalOpen(true)} className="h-10 w-10 flex-shrink-0" title="Search Products" disabled={products.length === 0 || isProcessingSale || isFindingProduct}>
                            <ListChecks className="h-5 w-5"/>
                        </Button>
                      </div>
                      {showCodeSuggestions && codeSuggestions.length > 0 && (
                          <div className="absolute z-20 w-full bg-card border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                            {codeSuggestions.map((p, index) => (
                              <div
                                key={p.id}
                                className={cn(
                                  "p-2 cursor-pointer",
                                  index === highlightedSuggestionIndex ? "bg-muted-foreground/20" : "hover:bg-muted"
                                )}
                                onMouseDown={() => handleSuggestionClick(p)}
                              >
                                <p className="font-medium">{p.name}</p>
                                <p className="text-sm text-muted-foreground">Code: {p.productCode} | Stock: {p.stock}</p>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                    <div>
                      <Label htmlFor="inventoryItemQuantity">
                          Quantity {selectedProductForStockHint ? <span className="text-muted-foreground text-xs ml-1">(In Stock: {selectedProductForStockHint.stock})</span> : ''}
                      </Label>
                      <Input
                        ref={quantityInputRef}
                        id="inventoryItemQuantity"
                        type="number"
                        value={inventoryItemQuantity}
                        onChange={e => setInventoryItemQuantity(e.target.value)}
                        onKeyDown={handleQuantityKeyDown}
                        min="1"
                        className="w-full md:w-24 text-center"
                        disabled={isFindingProduct || isProcessingSale }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mt-3">
                      <div>
                          <Label htmlFor="inventoryItemCostPrice">Cost Price (for this sale)</Label>
                          <Input
                              ref={inventoryItemCostPriceRef}
                              id="inventoryItemCostPrice"
                              type="number"
                              value={inventoryItemCostPrice}
                              onChange={e => setInventoryItemCostPrice(e.target.value)}
                              onKeyDown={handleInventoryItemCostPriceKeyDown}
                              step="0.01"
                              min="0"
                              className="w-full text-right"
                              disabled={isFindingProduct || isProcessingSale || !selectedProductForStockHint}
                          />
                      </div>
                      <div>
                          <Label htmlFor="inventoryItemSalePrice">Sale Price (for this sale)</Label>
                          <Input
                              ref={inventoryItemSalePriceRef}
                              id="inventoryItemSalePrice"
                              type="number"
                              value={inventoryItemSalePrice}
                              onChange={e => setInventoryItemSalePrice(e.target.value)}
                              onKeyDown={handleInventoryItemSalePriceKeyDown}
                              step="0.01"
                              min="0.01"
                              className="w-full text-right"
                              disabled={isFindingProduct || isProcessingSale || !selectedProductForStockHint}
                          />
                      </div>
                      <Button type="button" onClick={handleAddProductToOrder} className="self-end h-10" disabled={isFindingProduct || isProcessingSale || !selectedProductForStockHint}>
                          {isFindingProduct ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                          {isFindingProduct ? "Adding..." : "Add Item"}
                      </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {saleMode === "INSTANT" && (
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="font-headline text-xl flex items-center">
                    <Edit2 className="mr-2 h-5 w-5 text-primary" /> Add Manual Item
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                      <Label htmlFor="manualItemName">Item Name</Label>
                      <Input
                        ref={manualItemNameInputRef}
                        id="manualItemName"
                        value={manualItemName}
                        onChange={(e) => setManualItemName(e.target.value)}
                        onKeyDown={handleManualItemNameKeyDown}
                        disabled={isProcessingSale}
                      />
                    </div>
                    <div>
                      <Label htmlFor="manualItemQuantity">Quantity</Label>
                      <Input
                        ref={manualItemQuantityInputRef}
                        id="manualItemQuantity"
                        type="number"
                        value={manualItemQuantity}
                        onChange={(e) => setManualItemQuantity(e.target.value)}
                        onKeyDown={handleManualItemQuantityKeyDown}
                        min="1"
                        className="w-20 text-center"
                        disabled={isProcessingSale}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                     <div>
                      <Label htmlFor="manualItemCostPrice">Cost Price</Label>
                      <Input
                        ref={manualItemCostPriceInputRef}
                        id="manualItemCostPrice"
                        type="number"
                        value={manualItemCostPrice}
                        onChange={(e) => setManualItemCostPrice(e.target.value)}
                        onKeyDown={handleManualItemCostPriceKeyDown}
                        step="0.01"
                        min="0"
                        className="w-full text-right"
                        disabled={isProcessingSale}
                      />
                    </div>
                    <div>
                      <Label htmlFor="manualItemPrice">Sale Price</Label>
                      <Input
                        ref={manualItemPriceInputRef}
                        id="manualItemPrice"
                        type="number"
                        value={manualItemPrice}
                        onChange={(e) => setManualItemPrice(e.target.value)}
                        onKeyDown={handleManualItemPriceKeyDown}
                        step="0.01"
                        min="0.01"
                        className="w-full text-right"
                        disabled={isProcessingSale}
                      />
                    </div>
                    <Button type="button" onClick={handleAddManualItemToOrder} className="self-end h-10" disabled={isProcessingSale}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Manual
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>

          <div className="lg:col-span-1">
            <Card className="shadow-md sticky top-20">
              <CardHeader>
                <CardTitle className="font-headline text-xl">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto">
                {orderItems.length === 0 ? (
                  <p className="text-muted-foreground text-center py-10">
                    Your order is empty. Add products.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center w-[50px]">Qty</TableHead>
                        <TableHead className="text-center w-[70px]">Item Disc. %</TableHead>
                        <TableHead className="text-right w-[80px]">Total</TableHead>
                        <TableHead className="w-[40px] p-0 m-0 text-center"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium py-2">
                            {item.name}
                            {item.productCode && <span className="block text-xs text-muted-foreground">Code: {item.productCode}</span>}
                            {item.itemDiscountPercentage && item.itemDiscountPercentage > 0 && item.originalPrice && (
                              <span className="block text-xs text-green-600">
                                (Was: {formatCurrency(item.originalPrice, appSettings.currency, currencyForConversionSource)})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center py-2">{item.orderQuantity}</TableCell>
                          <TableCell className="text-center py-1">
                            {!item.isManualEntry && item.originalPrice !== undefined ? (
                                <Input
                                    type="number"
                                    value={item.itemDiscountPercentage === undefined ? "0" : item.itemDiscountPercentage.toString()}
                                    onChange={(e) => handleItemDiscountChange(item.id, e.target.value)}
                                    onKeyDown={handleOrderItemDiscountKeyDown}
                                    min="0"
                                    max="100"
                                    step="1"
                                    className="h-8 w-16 text-center text-xs p-1"
                                    disabled={isProcessingSale}
                                />
                            ) : (
                                <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                            </TableCell>
                          <TableCell className="text-right py-2">{formatCurrency(item.total, appSettings.currency, currencyForConversionSource)}</TableCell>
                          <TableCell className="py-1 px-1 text-center">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)} className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-7 w-7">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>

              {(subTotal > 0) && (
                 <>
                  <CardContent className="border-t py-4 space-y-2">
                    <div className="flex justify-between items-center text-md">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatCurrency(subTotal, appSettings.currency, currencyForConversionSource)}</span>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="discountInput">Discount Amount</Label>
                      <div className="flex gap-2">
                        <Input
                          ref={discountInputRef as React.Ref<HTMLInputElement>}
                          id="discountInput"
                          type="number"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          onBlur={handleApplyDiscount}
                          onKeyDown={handleDiscountInputKeyDown}
                          step="0.01"
                          min="0"
                          className="h-9"
                          disabled={subTotal <= 0 || isProcessingSale}
                        />
                        <Button type="button" size="sm" onClick={handleApplyDiscount} disabled={subTotal <=0 || isProcessingSale}>
                           <Percent className="mr-1 h-4 w-4"/> Apply
                        </Button>
                      </div>
                    </div>
                     {appliedDiscount > 0 && (
                        <div className="flex justify-between items-center text-md text-destructive">
                            <span>Discount Applied:</span>
                            <span className="font-medium">-{formatCurrency(appliedDiscount, appSettings.currency, currencyForConversionSource)}</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center text-lg font-semibold pt-2 border-t mt-2">
                      <span>Grand Total:</span>
                      <span className="font-headline">
                        {formatCurrency(grandTotal, appSettings.currency, currencyForConversionSource)}
                      </span>
                    </div>
                  </CardContent>
                  <CardContent className="border-t pt-4">
                      <Button
                        type="submit"
                        className="w-full text-lg py-3 h-auto"
                        disabled={isProcessingSale || orderItems.length === 0 || grandTotal < 0}
                        >
                        {isProcessingSale ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5" />}
                        {isProcessingSale ? "Processing..." : `Process ${saleMode === 'REGULAR' ? 'Regular' : 'Instant'} Sale`}
                      </Button>
                  </CardContent>
                 </>
              )}
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

