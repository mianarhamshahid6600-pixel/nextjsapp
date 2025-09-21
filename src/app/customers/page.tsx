
"use client";

import { useState, type FormEvent, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UserPlus, User, Phone, Mail, HomeIcon, UserSearch, Edit3, Trash2, Loader2, Building, UserCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addCustomerForUser,
  editCustomerForUser,
  deleteCustomerFromStorageForUser,
} from "@/lib/services/customer-service";
import type { Customer } from "@/lib/data-types";
import { format } from 'date-fns';
import { useAuth } from "@/contexts/auth-context";

export default function CustomersPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, coreAppData, refreshAuthContext } = useAuth();
  const { customers: localCustomers } = coreAppData;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [currentName, setCurrentName] = useState("");
  const [currentPhone, setCurrentPhone] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [currentCompanyName, setCurrentCompanyName] = useState("");

  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const filteredCustomers = useMemo(() => {
    const customersToFilter = localCustomers.filter(c => c.id !== "CUST_WALK_IN");
    if (!searchTerm.trim()) {
      return customersToFilter;
    }
    return customersToFilter.filter(customer =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.companyName && customer.companyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (customer.phone && customer.phone.includes(searchTerm)) ||
      (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [localCustomers, searchTerm]);

  const resetFormFields = () => {
    setCurrentName("");
    setCurrentPhone("");
    setCurrentEmail("");
    setCurrentAddress("");
    setCurrentCompanyName("");
    setEditingCustomer(null);
  };

  const handleOpenAddModal = () => {
    resetFormFields();
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setCurrentName(customer.name);
    setCurrentPhone(customer.phone);
    setCurrentEmail(customer.email || "");
    setCurrentAddress(customer.address || "");
    setCurrentCompanyName((customer as any).companyName || "");
    setIsEditModalOpen(true);
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (!currentName.trim() && !currentCompanyName.trim()) {
      toast({ title: "Error", description: "Customer Name or Company Name is required.", variant: "destructive" });
      return;
    }
    if (!currentPhone.trim()) {
      toast({ title: "Error", description: "Phone number is required.", variant: "destructive" });
      return;
    }


    setIsSubmittingForm(true);
    try {
      if (editingCustomer) {
        const updatePayload: Partial<Omit<Customer, 'id' | 'joinedDate'>> & { companyName?: string } = {
          name: currentName.trim() || `Customer_${Date.now()}`,
          companyName: currentCompanyName.trim() || undefined,
          phone: currentPhone.trim(),
          email: currentEmail.trim() || undefined,
          address: currentAddress.trim() || undefined,
        };
        await editCustomerForUser(userId, editingCustomer.id, updatePayload);
        toast({ title: "Success", description: `${updatePayload.name || updatePayload.companyName}'s details updated.` });
        setIsEditModalOpen(false);
      } else {
        await addCustomerForUser(userId, {
          name: currentName.trim() || `Customer_${Date.now()}`,
          companyName: currentCompanyName.trim() || undefined,
          phone: currentPhone.trim(),
          email: currentEmail.trim() || undefined,
          address: currentAddress.trim() || undefined,
        });
        toast({ title: "Success", description: `${currentName.trim() || currentCompanyName.trim() || 'New Customer'} added to customers.` });
        setIsAddModalOpen(false);
      }
      resetFormFields();
      await refreshAuthContext(true); // Refresh all data
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save customer.", variant: "destructive" });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleOpenDeleteConfirm = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete || !userId) return;
    setIsDeletingCustomer(true);
    try {
      await deleteCustomerFromStorageForUser(userId, customerToDelete.id);
      toast({ title: "Success", description: `${customerToDelete.name || customerToDelete.companyName} removed.` });
      await refreshAuthContext(true); // Refresh all data
      setIsDeleteConfirmOpen(false);
      setCustomerToDelete(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to remove customer.", variant: "destructive" });
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const formatJoinedDate = (isoDate: string) => {
    try {
        return format(new Date(isoDate), "PP");
    } catch (e) {
        return "N/A";
    }
  }

  const renderSupplierForm = (
    <form onSubmit={handleFormSubmit} className="space-y-4 pt-4">
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currentName" className="flex items-center mb-1"><UserCircle className="inline mr-2 h-4 w-4 text-muted-foreground" />Customer Name</Label>
          <Input id="currentName" value={currentName} onChange={(e) => setCurrentName(e.target.value)} placeholder="Customer's Name" disabled={isSubmittingForm} />
        </div>
         <div>
          <Label htmlFor="currentCompanyName" className="flex items-center mb-1"><Building className="inline mr-2 h-4 w-4 text-muted-foreground" />Company Name</Label>
          <Input id="currentCompanyName" value={currentCompanyName} onChange={(e) => setCurrentCompanyName(e.target.value)} placeholder="Customer's Company" disabled={isSubmittingForm} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currentPhone" className="flex items-center mb-1"><Phone className="inline mr-2 h-4 w-4 text-muted-foreground" />Phone</Label>
          <Input id="currentPhone" type="tel" value={currentPhone} onChange={(e) => setCurrentPhone(e.target.value)} placeholder="Phone Number" required disabled={isSubmittingForm} />
        </div>
        <div>
          <Label htmlFor="currentEmail" className="flex items-center mb-1"><Mail className="inline mr-2 h-4 w-4 text-muted-foreground" />Email</Label>
          <Input id="currentEmail" type="email" value={currentEmail} onChange={(e) => setCurrentEmail(e.target.value)} placeholder="Email Address" disabled={isSubmittingForm} />
        </div>
      </div>
      <div>
        <Label htmlFor="currentAddress" className="flex items-center mb-1"><HomeIcon className="inline mr-2 h-4 w-4 text-muted-foreground" />Address</Label>
        <Textarea id="currentAddress" value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} placeholder="Street Address, City, State" disabled={isSubmittingForm} rows={2} />
      </div>
      <DialogFooter className="pt-4">
        <DialogClose asChild>
           <Button type="button" variant="outline" onClick={() => editingCustomer ? setIsEditModalOpen(false) : setIsAddModalOpen(false)} disabled={isSubmittingForm}>Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmittingForm}>
          {isSubmittingForm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmittingForm ? (editingCustomer ? "Saving..." : "Adding...") : (editingCustomer ? "Save Changes" : "Add Customer")}
        </Button>
      </DialogFooter>
    </form>
  );

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading customers...</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to manage customers.</p>;
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div/>
        <Button onClick={handleOpenAddModal} disabled={isSubmittingForm || isDeletingCustomer}>
          <UserPlus className="mr-2 h-4 w-4" /> Add New Customer
        </Button>
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">Add New Customer</DialogTitle>
            <DialogDescription>Enter the details for the new customer.</DialogDescription>
          </DialogHeader>
          {renderSupplierForm}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">Edit Customer</DialogTitle>
            <DialogDescription>Update the details for {editingCustomer?.name}.</DialogDescription>
          </DialogHeader>
          {renderSupplierForm}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {customerToDelete?.name || customerToDelete?.companyName} and remove their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCustomer}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90" disabled={isDeletingCustomer}>
              {isDeletingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeletingCustomer ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center"><UserSearch className="mr-2 h-5 w-5 text-primary"/> Customer List</CardTitle>
           <Input
              placeholder="Search by Name, Company, Phone, or Email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-2"
              disabled={isSubmittingForm || isDeletingCustomer}
            />
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Name / Company</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="font-medium">{customer.name || customer.companyName}</div>
                    {customer.name && customer.companyName && <div className="text-xs text-muted-foreground">({customer.companyName})</div>}
                  </TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.email || "N/A"}</TableCell>
                  <TableCell>{formatJoinedDate(customer.joinedDate)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" onClick={() => handleOpenEditModal(customer)} disabled={isSubmittingForm || isDeletingCustomer}>
                        <Edit3 className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8" onClick={() => handleOpenDeleteConfirm(customer)} disabled={isSubmittingForm || isDeletingCustomer}>
                        <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                        {localCustomers.length === 0 ? "No customers found. Add your first customer!" : "No customers match your search."}
                    </TableCell>
                  </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
