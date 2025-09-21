
"use client";

import { useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageSearch, Search } from "lucide-react";
import type { Product, AppSettings } from "@/lib/data-types";
import { formatCurrency } from "@/lib/currency-utils";

interface ProductSelectionDialogProps {
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  products: Product[];
  appSettings: AppSettings;
  onProductSelect: (product: Product) => void;
  context?: "checkout" | "purchase"; // To display relevant price
}

export function ProductSelectionDialog({
  isOpen,
  onOpenChange,
  products,
  appSettings,
  onProductSelect,
  context = "checkout",
}: ProductSelectionDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      return products;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(lowerSearchTerm) ||
        product.productCode.toLowerCase().includes(lowerSearchTerm) || // Search by product code
        (product.category && product.category.toLowerCase().includes(lowerSearchTerm)) ||
        product.id.toLowerCase().includes(lowerSearchTerm)
    );
  }, [products, searchTerm]);

  const handleSelectProduct = (product: Product) => {
    onProductSelect(product);
    onOpenChange(false);
    setSearchTerm(""); // Reset search term on close
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { onOpenChange(open); if (!open) setSearchTerm(""); }}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col"> {/* Increased width sm:max-w-3xl */}
        <DialogHeader>
          <DialogTitle className="flex items-center"><PackageSearch className="mr-2 h-5 w-5 text-primary" />Select Product</DialogTitle>
          <DialogDescription>
            Search and select a product from your inventory.
          </DialogDescription>
        </DialogHeader>
        <div className="relative my-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search by Name, Code, Category, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
            />
        </div>
        <ScrollArea className="flex-grow border rounded-md">
          {filteredProducts.length > 0 ? (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-[120px]">Code</TableHead> {/* Added Code column */}
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">
                    {context === "purchase" ? `Cost (${appSettings.currency})` : `Price (${appSettings.currency})`}
                  </TableHead>
                  <TableHead className="w-[80px] text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs">{product.productCode}</TableCell> {/* Display Product Code */}
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{product.category || "N/A"}</TableCell>
                    <TableCell className="text-right">{product.stock}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(context === "purchase" ? (product.costPrice || 0) : product.price, appSettings.currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        onClick={() => handleSelectProduct(product)}
                        disabled={context === "checkout" && product.stock === 0}
                      >
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              No products match your search or inventory is empty.
            </div>
          )}
        </ScrollArea>
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
