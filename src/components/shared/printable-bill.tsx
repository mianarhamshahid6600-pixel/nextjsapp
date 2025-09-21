

"use client";

import React from 'react';
import type { Sale, AppSettings, SaleItem, Customer } from '@/lib/data-types';
import { formatCurrency } from '@/lib/currency-utils';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';

interface PrintableBillProps {
  saleData: Sale | null;
  appSettings: AppSettings | null;
}

const PrintableBillComponent = React.forwardRef<HTMLDivElement, PrintableBillProps>(({ saleData, appSettings }, ref) => {
  const { coreAppData } = useAuth(); // Access coreAppData for customers
  
  if (!saleData || !appSettings) {
    return null;
  }

  const formatDate = (isoDate: string) => {
    try {
      return format(new Date(isoDate), "dd/MM/yyyy");
    } catch (e) {
      return "N/A";
    }
  };

  const getRate = (item: SaleItem): number => {
    return item.originalPriceBeforeItemDiscount !== undefined && item.originalPriceBeforeItemDiscount !== null
      ? item.originalPriceBeforeItemDiscount
      : item.price;
  };

  const getDiscountAmount = (item: SaleItem): number => {
      const rate = getRate(item);
      const lineTotal = item.quantity * rate;
      const discountPercentage = item.itemDiscountAppliedPercentage || 0;
      return lineTotal * (discountPercentage / 100);
  }
  
  const getNetPP = (item: SaleItem): number => {
      const rate = getRate(item);
      const lineTotal = item.quantity * rate;
      const discount = getDiscountAmount(item);
      if (item.quantity === 0) return 0;
      return (lineTotal - discount) / item.quantity;
  }

  const getCustomerInfo = (): { name: string; phone?: string } => {
    if (saleData.customerId) {
        const customer = coreAppData.customers.find(c => c.id === saleData.customerId);
        if (customer) {
            return {
                name: customer.name,
                phone: customer.phone && customer.phone !== 'N/A' ? customer.phone : undefined
            };
        }
    }
    return { name: saleData.customerName || "CASH" };
  };

  const customerInfo = getCustomerInfo();


  const inlineStyles = {
    billArea: {
      width: '80mm',
      margin: '0 auto',
      padding: '2mm',
      fontSize: '8pt',
      lineHeight: 1.2,
      fontFamily: "'Courier New', Courier, monospace",
      backgroundColor: 'white',
      color: 'black',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '2mm',
    },
    companyName: {
      fontSize: '14pt',
      fontWeight: 'bold' as const,
      marginBottom: '0.5mm',
    },
    phoneLine: {
      fontSize: '9pt',
      marginBottom: '2mm',
      fontWeight: 'normal' as const,
    },
    invoiceInfo: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '2mm',
      fontSize: '9pt',
      paddingBottom: '1mm',
    },
    leftInfo: {
      textAlign: 'left' as const,
    },
    rightInfo: {
      textAlign: 'right' as const,
    },
    rightInfoP: {
      margin: '0 0 0.25mm 0',
      lineHeight: 1.2,
    },
    customerName: {
      fontWeight: 'bold' as const,
    },
    customerPhone: {
        fontSize: '7pt',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      marginBottom: '2mm',
      fontSize: '8pt',
      border: '1px solid #000',
    },
    th: {
      padding: '0.75mm 1mm',
      textAlign: 'left' as const,
      verticalAlign: 'top' as const,
      wordBreak: 'break-word' as const,
      border: '1px solid #000',
      fontWeight: 'bold' as const,
      backgroundColor: '#f0f0f0',
    },
    td: {
      padding: '0.75mm 1mm',
      textAlign: 'left' as const,
      verticalAlign: 'top' as const,
      wordBreak: 'break-word' as const,
      border: '1px solid #000',
    },
    colQty: { width: '10%', textAlign: 'center' as const },
    colQtyHeader: { fontSize: '7pt', textAlign: 'center' as const},
    colDetails: { width: '30%' },
    colRate: { width: '15%', textAlign: 'right' as const },
    colDiscount: { width: '15%', textAlign: 'right' as const },
    colNet: { width: '15%', textAlign: 'right' as const },
    colTotal: { width: '15%', textAlign: 'right' as const },
    totalsSection: {
      marginTop: '2mm',
      fontSize: '12pt',
      padding: '1mm 0',
      borderTop: '2px solid black',
      borderBottom: '2px solid black',
    },
    totalsDiv: {
      display: 'flex',
      justifyContent: 'space-between',
      fontWeight: 'bold' as const,
    },
    footerNote: {
      marginTop: '3mm',
      fontSize: '7pt',
      textAlign: 'center' as const,
    }
  };

  return (
    <div ref={ref} className="printable-bill-render-area" style={inlineStyles.billArea}>
      <div style={inlineStyles.header}>
        <div style={inlineStyles.companyName}>{appSettings.companyDisplayName || "PRIME TRADERS"}</div>
        <div style={inlineStyles.phoneLine}>Phone : 041-2600174</div>
      </div>

      <div style={inlineStyles.invoiceInfo}>
        <div style={inlineStyles.leftInfo}>
            <p style={inlineStyles.customerName}>{customerInfo.name}</p>
            {customerInfo.phone && <p style={inlineStyles.customerPhone}>{customerInfo.phone}</p>}
        </div>
        <div style={inlineStyles.rightInfo}>
          <p style={inlineStyles.rightInfoP}>INV: {saleData.numericSaleId}</p>
          <p style={inlineStyles.rightInfoP}>Date: {formatDate(saleData.saleDate)}</p>
        </div>
      </div>

      <table style={inlineStyles.table}>
        <thead>
          <tr>
            <th style={{...inlineStyles.th, ...inlineStyles.colQty, ...inlineStyles.colQtyHeader}}>Qty</th>
            <th style={{...inlineStyles.th, ...inlineStyles.colDetails}}>Details</th>
            <th style={{...inlineStyles.th, ...inlineStyles.colRate}}>Rate</th>
            <th style={{...inlineStyles.th, ...inlineStyles.colDiscount}}>Discount</th>
            <th style={{...inlineStyles.th, ...inlineStyles.colNet}}>Net P.P</th>
            <th style={{...inlineStyles.th, ...inlineStyles.colTotal}}>Total</th>
          </tr>
        </thead>
        <tbody>
          {saleData.items.map((item, index) => {
            const itemRate = getRate(item);
            const itemDiscount = getDiscountAmount(item);
            const itemNetPP = getNetPP(item);
            const itemTotal = item.total;
            return (
              <tr key={item.productId === "MANUAL_ENTRY" ? `manual-${index}` : item.productId}>
                <td style={{...inlineStyles.td, ...inlineStyles.colQty}}>{item.quantity}</td>
                <td style={{...inlineStyles.td, ...inlineStyles.colDetails}}>{item.productName}</td>
                <td style={{...inlineStyles.td, ...inlineStyles.colRate}}>{itemRate.toFixed(2)}</td>
                <td style={{...inlineStyles.td, ...inlineStyles.colDiscount}}>{itemDiscount.toFixed(2)}</td>
                <td style={{...inlineStyles.td, ...inlineStyles.colNet}}>{itemNetPP.toFixed(2)}</td>
                <td style={{...inlineStyles.td, ...inlineStyles.colTotal}}>{itemTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {saleData.discountAmount && saleData.discountAmount > 0 && (
         <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '10pt', fontWeight: 'bold', paddingRight: '1mm', borderBottom: '1px solid #000', paddingBottom: '1mm', marginBottom: '1mm' }}>
             <div style={{ display: 'flex', width: '50%', justifyContent: 'space-between' }}>
                <span>Inv. Discount:</span>
                <span>({formatCurrency(saleData.discountAmount, appSettings.currency, null).replace(/[^0-9.,]/g, '')})</span>
             </div>
         </div>
      )}


      <div style={inlineStyles.totalsSection}>
        <div style={inlineStyles.totalsDiv}>
          <span>Total:</span>
          <span>{formatCurrency(saleData.grandTotal, appSettings.currency, null)}</span>
        </div>
      </div>
      
       <div style={inlineStyles.footerNote}>
          PRODUCTS TAKEN WILL BE EXCHANGED OR RETURNED, IF THE
          PRODUCT ARE FRESH AND IN THERE ORIGNAL PACKING...
       </div>
    </div>
  );
});

PrintableBillComponent.displayName = 'PrintableBillComponent';
export const PrintableBill = React.memo(PrintableBillComponent);
