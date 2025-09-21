
// src/lib/currency-utils.ts
import { convertAmount } from './exchange-rates';

export const currencySymbols: Record<string, string> = {
  PKR: "Rs",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AED: "AED",
};

/**
 * Formats a numeric amount into a currency string, optionally converting it.
 * @param amount The numeric amount.
 * @param displayCurrencyCode The ISO currency code for display (e.g., "USD", "PKR").
 * @param sourceCurrencyForConversion If provided and different from displayCurrencyCode, amount is converted from this currency.
 * @returns A string representing the formatted (and possibly converted) currency.
 */
export function formatCurrency(
  amount: number | undefined | null,
  displayCurrencyCode: string,
  sourceCurrencyForConversion?: string | null
): string {
  const targetSymbol = currencySymbols[displayCurrencyCode] || displayCurrencyCode;

  if (amount === null || amount === undefined || isNaN(amount)) {
    return `${targetSymbol} N/A`;
  }

  let amountToFormat = amount;

  if (
    sourceCurrencyForConversion &&
    sourceCurrencyForConversion !== displayCurrencyCode
  ) {
    amountToFormat = convertAmount(amount, sourceCurrencyForConversion, displayCurrencyCode);
  }

  try {
    const formattedString = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: displayCurrencyCode,
      currencyDisplay: 'symbol', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountToFormat);

    // Use custom symbol for PKR if Intl provides the code.
    if (displayCurrencyCode === 'PKR') {
      return `${targetSymbol} ${amountToFormat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    return formattedString;

  } catch (e) {
    return `${targetSymbol} ${amountToFormat.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
