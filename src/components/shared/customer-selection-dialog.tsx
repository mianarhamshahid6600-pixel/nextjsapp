
"use client";

import { useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search } from "lucide-react";
import type { Customer } from "@/lib/data-types";
import { format } from 'date-fns';

interface CustomerSelectionDialogProps {
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  customers: Customer[];
  onCustomerSelect: (customer: Customer) => void;
}

export function CustomerSelectionDialog({
  isOpen,
  onOpenChange,
  customers,
  onCustomerSelect,
}: CustomerSelectionDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCustomers = useMemo(() => {
    // Exclude walk-in customer from dialog selection as it's usually a default/direct select.
    const actualCustomers = customers.filter(c => c.id !== "CUST_WALK_IN");
    if (!searchTerm.trim()) {
      return actualCustomers;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return actualCustomers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(lowerSearchTerm) ||
        (customer.phone && customer.phone.includes(lowerSearchTerm)) ||
        (customer.email && customer.email.toLowerCase().includes(lowerSearchTerm)) ||
        customer.id.toLowerCase().includes(lowerSearchTerm)
    );
  }, [customers, searchTerm]);

  const handleSelectCustomer = (customer: Customer) => {
    onCustomerSelect(customer);
    onOpenChange(false);
    setSearchTerm(""); // Reset search term on close/select
  };
  
  const formatJoinedDate = (isoDate: string) => {
    try {
        return format(new Date(isoDate), "PP"); 
    } catch (e) {
        return "N/A";
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { onOpenChange(open); if (!open) setSearchTerm(""); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center"><Users className="mr-2 h-5 w-5 text-primary" />Select Customer</DialogTitle>
          <DialogDescription>
            Search and select a customer.
          </DialogDescription>
        </DialogHeader>
        <div className="relative my-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search by Name, Phone, Email, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
            />
        </div>
        <ScrollArea className="flex-grow border rounded-md">
          {filteredCustomers.length > 0 ? (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px] text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>{customer.name}</TableCell>
                    <TableCell>{customer.phone || "N/A"}</TableCell>
                    <TableCell>{customer.email || "N/A"}</TableCell>
                    <TableCell>{formatJoinedDate(customer.joinedDate)}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        onClick={() => handleSelectCustomer(customer)}
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
              No customers match your search or no registered customers available.
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
