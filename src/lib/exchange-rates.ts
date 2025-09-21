
// src/lib/exchange-rates.ts

// Rates to convert FROM the specified currency TO USD (our common base for this map)
export const exchangeRatesToUSD: Record<string, number> = {
  USD: 1,
  PKR: 1 / 278.50, // 1 PKR = X USD
  EUR: 1.08,       // 1 EUR = 1.08 USD
  GBP: 1.27,       // 1 GBP = 1.27 USD
  INR: 1 / 83.30,  // 1 INR = X USD
  AED: 1 / 3.67,   // 1 AED = X USD
};

/**
 * Converts an amount from a source currency to a target currency.
 * @param amount The amount to convert.
 * @param fromCurrency The ISO code of the source currency.
 * @param toCurrency The ISO code of the target currency.
 * @returns The converted amount, or the original amount if conversion is not possible.
 */
export function convertAmount(amount: number, fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const fromRateToUSD = exchangeRatesToUSD[fromCurrency];
  const toRateToUSD = exchangeRatesToUSD[toCurrency];

  if (typeof fromRateToUSD !== 'number' || typeof toRateToUSD !== 'number') {
    console.warn(
      `Exchange rate not available for ${fromCurrency} or ${toCurrency}. Returning original amount.`
    );
    // Fallback: return original amount if a rate is missing to prevent NaN or errors.
    // In a real app, this should be handled more gracefully, perhaps fetching missing rates or erroring.
    return amount;
  }

  // Convert fromCurrency to USD
  const amountInUSD = amount * fromRateToUSD;

  // Convert amountInUSD to toCurrency
  const convertedAmount = amountInUSD / toRateToUSD;

  return convertedAmount;
}
