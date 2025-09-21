
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { BusinessTransaction } from "@/lib/data-types"; 
import { adjustBusinessCashBalanceForUser } from "@/lib/services/financial-service"; 

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const updateCashAfterTransaction = async (transaction: BusinessTransaction) => {
  if (!transaction || !transaction.userId) return;
  
  const amount = Math.abs(transaction.amount); 
  const type = transaction.type;

  // This function is called AFTER a business transaction (like sale income or purchase payment) is already recorded.
  // The adjustBusinessCashBalanceForUser in financial-service ALREADY handles the business transaction log for the adjustment itself.
  // So, if 'sale_income' or 'purchase_payment' are passed here, we are essentially double-adjusting OR this function is for other types.
  // For now, assuming this function is intended to be called for primary transactions (sale, purchase) and then it triggers a corresponding cash balance update.
  // The adjustBusinessCashBalanceForUser function should NOT create a duplicate "sale_income" or "purchase_payment" transaction,
  // but rather a "manual_adjustment_credit" or "manual_adjustment_debit" that corresponds to the cash change from the primary transaction.
  // This needs careful handling to avoid double counting or mis-typed transactions.

  // Let's assume adjustBusinessCashBalanceForUser creates 'manual_adjustment_credit/debit' based on the type of transaction it's reacting to.
  
  // If transaction.type is 'sale_income', it means cash came IN.
  // If transaction.type is 'purchase_payment', it means cash went OUT.

  try {
    if (type === "sale_income" || type === "other_income" || type === "manual_adjustment_credit") {
      // This condition is problematic if adjustBusinessCashBalanceForUser itself logs a manual_adjustment_credit.
      // We should only call adjust for primary events like 'sale_income'.
      if (type === "sale_income" || type === "other_income") {
         // No need to call adjustBusinessCashBalanceForUser here, as the processSale/addPurchase etc.
         // ALREADY updates the business cash balance directly within their transactions.
         // This utility might be redundant or for a different purpose.
         // console.log(`Cash balance automatically updated by transaction ${transaction.id} of type ${type}`);
      }
    } else if (type === "purchase_payment" || type === "supplier_payment" || type === "other_expense" || type === "manual_adjustment_debit") {
      if (type === "purchase_payment" || type === "supplier_payment" || type === "other_expense") {
        // console.log(`Cash balance automatically updated by transaction ${transaction.id} of type ${type}`);
      }
    }
    // Given that processSaleForUser and addPurchaseInvoiceForUser now directly handle cash updates
    // within their Firestore transactions, this utility function might be redundant for those primary flows.
    // It could be useful if we had other types of transactions that didn't auto-update cash.
    // For now, making it a no-op to prevent double adjustments.
    console.warn("updateCashAfterTransaction: This function's logic is likely redundant as primary services (sale, purchase) now handle cash balance updates directly within their transactions. No operation performed by this utility.");

  } catch (error) {
      console.error("Error in updateCashAfterTransaction (now a no-op):", error);
      // Potentially re-throw or handle as needed
  }
  return Promise.resolve();
};
