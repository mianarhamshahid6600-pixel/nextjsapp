
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, UserCircle, Phone, Mail, HomeIcon, Edit3, Trash2, Loader2, Search, Truck, Info, ClipboardSignature, Building, FileText, Banknote, Users2, BadgeDollarSign, BadgeAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addSupplierForUser,
  editSupplierForUser,
  deleteSupplierFromStorageForUser,
  getSuppliersForUser, // Import data fetching function
} from "@/lib/services/supplier-service";
import type { Supplier } from "@/lib/data-types";
import { format } from 'date-fns';
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-utils";


export default function SuppliersPage() {
  const { toast } = useToast();
  const { user, userId, isLoading: authLoading, appSettings, currencyForConversionSource } = useAuth();

  const [localSuppliers, setLocalSuppliers] = useState<Supplier[]>([]);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [currentName, setCurrentName] = useState("");
  const [currentCompanyName, setCurrentCompanyName] = useState("");
  const [currentContactPerson, setCurrentContactPerson] = useState("");
  const [currentPhone, setCurrentPhone] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [currentGstTaxNumber, setCurrentGstTaxNumber] = useState("");
  const [currentOpeningBalance, setCurrentOpeningBalance] = useState<string>("0");
  const [currentOpeningBalanceType, setCurrentOpeningBalanceType] = useState<'owedToSupplier' | 'owedByUser'>("owedToSupplier");
  const [currentNotes, setCurrentNotes] = useState("");


  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isDeletingSupplier, setIsDeletingSupplier] = useState(false);

  const fetchPageData = useCallback(async () => {
    if (!userId) {
      setIsLoadingPageData(false);
      return;
    }
    setIsLoadingPageData(true);
    try {
      const suppliersData = await getSuppliersForUser(userId);
      setLocalSuppliers(suppliersData);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load suppliers.", variant: "destructive" });
    } finally {
      setIsLoadingPageData(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (!authLoading && userId) {
      fetchPageData();
    }
  }, [authLoading, userId, fetchPageData]);


  const filteredSuppliers = useMemo(() => localSuppliers.filter(supplier =>
    (supplier.name && supplier.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (supplier.companyName && supplier.companyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (supplier.phone && supplier.phone.includes(searchTerm))
  ), [localSuppliers, searchTerm]);

  const { totalSuppliersCount, totalDueToSuppliers, totalToReceiveFromSuppliers } = useMemo(() => {
    const count = localSuppliers.length;
    const dueTo = localSuppliers.reduce((sum, supplier) => {
      return sum + (supplier.currentBalance > 0 ? supplier.currentBalance : 0);
    }, 0);
    const toReceive = localSuppliers.reduce((sum, supplier) => {
      return sum + (supplier.currentBalance < 0 ? Math.abs(supplier.currentBalance) : 0);
    }, 0);
    return { totalSuppliersCount: count, totalDueToSuppliers: dueTo, totalToReceiveFromSuppliers: toReceive };
  }, [localSuppliers]);


  const resetFormFields = () => {
    setCurrentName("");
    setCurrentCompanyName("");
    setCurrentContactPerson("");
    setCurrentPhone("");
    setCurrentEmail("");
    setCurrentAddress("");
    setCurrentGstTaxNumber("");
    setCurrentOpeningBalance("0");
    setCurrentOpeningBalanceType("owedToSupplier");
    setCurrentNotes("");
    setEditingSupplier(null);
  };

  const handleOpenAddModal = () => {
    resetFormFields();
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setCurrentName(supplier.name);
    setCurrentCompanyName(supplier.companyName || "");
    setCurrentContactPerson(supplier.contactPerson || "");
    setCurrentPhone(supplier.phone);
    setCurrentEmail(supplier.email || "");
    setCurrentAddress(supplier.address || "");
    setCurrentGstTaxNumber(supplier.gstTaxNumber || "");
    setCurrentOpeningBalance((supplier.openingBalance || 0).toString());
    setCurrentOpeningBalanceType(supplier.openingBalanceType || "owedToSupplier");
    setCurrentNotes(supplier.notes || "");
    setIsEditModalOpen(true);
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (!currentName.trim() && !currentCompanyName.trim()) {
      toast({ title: "Error", description: "Either Supplier Name or Company Name is required.", variant: "destructive" });
      return;
    }
     if (!currentPhone.trim()) {
      toast({ title: "Error", description: "Phone Number is required.", variant: "destructive" });
      return;
    }

    setIsSubmittingForm(true);

    const openingBalanceNum = parseFloat(currentOpeningBalance) || 0;

    try {
      const supplierData = {
        name: currentName.trim(),
        companyName: currentCompanyName.trim() || undefined,
        contactPerson: currentContactPerson.trim() || undefined,
        phone: currentPhone.trim(),
        email: currentEmail.trim() || undefined,
        address: currentAddress.trim() || undefined,
        gstTaxNumber: currentGstTaxNumber.trim() || undefined,
        openingBalance: openingBalanceNum,
        openingBalanceType: currentOpeningBalanceType,
        notes: currentNotes.trim() || undefined,
      };

      if (editingSupplier) {
        await editSupplierForUser(userId, editingSupplier.id, supplierData);
        toast({ title: "Success", description: `${currentName.trim() || currentCompanyName.trim()}'s details updated.` });
        setIsEditModalOpen(false);
      } else {
        await addSupplierForUser(userId, supplierData);
        toast({ title: "Success", description: `${currentName.trim() || currentCompanyName.trim()} added to suppliers.` });
        setIsAddModalOpen(false);
      }
      resetFormFields();
      await fetchPageData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save supplier.", variant: "destructive" });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleOpenDeleteConfirm = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!supplierToDelete || !userId) return;
    setIsDeletingSupplier(true);
    try {
      await deleteSupplierFromStorageForUser(userId, supplierToDelete.id);
      toast({ title: "Success", description: `${supplierToDelete.name || supplierToDelete.companyName} removed.` });
      await fetchPageData();
      setIsDeleteConfirmOpen(false);
      setSupplierToDelete(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to remove supplier.", variant: "destructive" });
    } finally {
      setIsDeletingSupplier(false);
      if (error) setIsDeleteConfirmOpen(false);
    }
  };

  const formatDateAdded = (isoDate: string) => {
    try {
        return format(new Date(isoDate), "PP");
    } catch (e) {
        return "N/A";
    }
  }

  const renderSupplierForm = (
    <form onSubmit={handleFormSubmit} className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currentName" className="flex items-center mb-1"><UserCircle className="inline mr-2 h-4 w-4 text-muted-foreground" />Supplier Name</Label>
          <Input id="currentName" value={currentName} onChange={(e) => setCurrentName(e.target.value)} placeholder="Supplier Contact Name" disabled={isSubmittingForm} />
        </div>
         <div>
          <Label htmlFor="currentCompanyName" className="flex items-center mb-1"><Building className="inline mr-2 h-4 w-4 text-muted-foreground" />Company Name</Label>
          <Input id="currentCompanyName" value={currentCompanyName} onChange={(e) => setCurrentCompanyName(e.target.value)} placeholder="Supplier Company Name" disabled={isSubmittingForm} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
         <div>
          <Label htmlFor="currentContactPerson" className="flex items-center mb-1"><UserCircle className="inline mr-2 h-4 w-4 text-muted-foreground" />Alt. Contact Person</Label>
          <Input id="currentContactPerson" value={currentContactPerson} onChange={(e) => setCurrentContactPerson(e.target.value)} placeholder="Alternative Contact Name" disabled={isSubmittingForm} />
        </div>
        <div>
          <Label htmlFor="currentPhone" className="flex items-center mb-1"><Phone className="inline mr-2 h-4 w-4 text-muted-foreground" />Phone</Label>
          <Input id="currentPhone" type="tel" value={currentPhone} onChange={(e) => setCurrentPhone(e.target.value)} placeholder="Phone Number" required disabled={isSubmittingForm} />
        </div>
      </div>
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currentEmail" className="flex items-center mb-1"><Mail className="inline mr-2 h-4 w-4 text-muted-foreground" />Email</Label>
          <Input id="currentEmail" type="email" value={currentEmail} onChange={(e) => setCurrentEmail(e.target.value)} placeholder="Email Address" disabled={isSubmittingForm} />
        </div>
         <div>
          <Label htmlFor="currentGstTaxNumber" className="flex items-center mb-1"><FileText className="inline mr-2 h-4 w-4 text-muted-foreground" />GST/Tax Number</Label>
          <Input id="currentGstTaxNumber" value={currentGstTaxNumber} onChange={(e) => setCurrentGstTaxNumber(e.target.value)} placeholder="GSTIN / Tax ID" disabled={isSubmittingForm} />
        </div>
      </div>
      <div>
        <Label htmlFor="currentAddress" className="flex items-center mb-1"><HomeIcon className="inline mr-2 h-4 w-4 text-muted-foreground" />Address</Label>
        <Textarea id="currentAddress" value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} placeholder="Street Address, City, State" disabled={isSubmittingForm} rows={2} />
      </div>
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
            <Label htmlFor="currentOpeningBalance" className="flex items-center mb-1"><Banknote className="inline mr-2 h-4 w-4 text-muted-foreground" />Opening Balance</Label>
            <Input id="currentOpeningBalance" type="number" value={currentOpeningBalance} onChange={(e) => setCurrentOpeningBalance(e.target.value)} placeholder="0.00" step="0.01" disabled={isSubmittingForm || !!editingSupplier} />
        </div>
        <div>
            <Label htmlFor="currentOpeningBalanceType" className="flex items-center mb-1">Opening Balance Type</Label>
            <Select value={currentOpeningBalanceType} onValueChange={(value: 'owedToSupplier' | 'owedByUser') => setCurrentOpeningBalanceType(value)} disabled={isSubmittingForm || !!editingSupplier}>
                <SelectTrigger id="currentOpeningBalanceType">
                    <SelectValue placeholder="Select balance type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="owedToSupplier">You Owe Supplier</SelectItem>
                    <SelectItem value="owedByUser">Supplier Owes You</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </div>
      {editingSupplier && (
        <div>
            <Label htmlFor="currentCalculatedBalance" className="flex items-center mb-1"><BadgeDollarSign className="inline mr-2 h-4 w-4 text-muted-foreground" />Current Calculated Balance</Label>
            <Input
                id="currentCalculatedBalance"
                value={formatCurrency(editingSupplier.currentBalance, appSettings?.currency || 'USD', currencyForConversionSource) + (editingSupplier.currentBalance > 0 ? " (You Owe)" : editingSupplier.currentBalance < 0 ? " (Owes You)" : " (Settled)")}
                disabled
                className="font-semibold" />

        </div>
      )}
      <div>
        <Label htmlFor="currentNotes" className="flex items-center mb-1"><ClipboardSignature className="inline mr-2 h-4 w-4 text-muted-foreground" />Notes</Label>
        <Textarea id="currentNotes" value={currentNotes} onChange={(e) => setCurrentNotes(e.target.value)} placeholder="E.g., Specializes in vitamins, Payment terms: Net 30" disabled={isSubmittingForm} rows={3}/>
      </div>
      <DialogFooter className="pt-4">
        <DialogClose asChild>
           <Button type="button" variant="outline" onClick={() => editingSupplier ? setIsEditModalOpen(false) : setIsAddModalOpen(false)} disabled={isSubmittingForm}>Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmittingForm}>
          {isSubmittingForm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmittingForm ? (editingSupplier ? "Saving..." : "Adding...") : (editingSupplier ? "Save Changes" : "Add Supplier")}
        </Button>
      </DialogFooter>
    </form>
  );

  if (authLoading || isLoadingPageData || !appSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3">Loading suppliers...</p>
      </div>
    );
  }
  if (!user) {
    return <p className="text-center text-lg">Please log in to manage suppliers.</p>;
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-3 shadow-sm">
                <CardHeader className="p-0 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center"><Users2 className="h-4 w-4 mr-1 text-primary"/>Total Suppliers</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="text-xl font-bold">{totalSuppliersCount}</div>
                </CardContent>
            </Card>
             <Card className="p-3 shadow-sm">
                <CardHeader className="p-0 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center"><BadgeAlert className="h-4 w-4 mr-1 text-destructive"/>Total Due to Suppliers</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="text-xl font-bold">{formatCurrency(totalDueToSuppliers, appSettings.currency, currencyForConversionSource)}</div>
                </CardContent>
            </Card>
            <Card className="p-3 shadow-sm">
                <CardHeader className="p-0 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center"><BadgeDollarSign className="h-4 w-4 mr-1 text-green-600"/>Total To Receive</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="text-xl font-bold">{formatCurrency(totalToReceiveFromSuppliers, appSettings.currency, currencyForConversionSource)}</div>
                </CardContent>
            </Card>
        </div>
        <Button onClick={handleOpenAddModal} disabled={isSubmittingForm || isDeletingSupplier}>
          <UserPlus className="mr-2 h-4 w-4" /> Add New Supplier
        </Button>
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={(isOpen) => { if (!isSubmittingForm) setIsAddModalOpen(isOpen); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">Add New Supplier</DialogTitle>
            <DialogDescription>Enter the details for the new supplier.</DialogDescription>
          </DialogHeader>
          {renderSupplierForm}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={(isOpen) => { if (!isSubmittingForm) setIsEditModalOpen(isOpen); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">Edit Supplier</DialogTitle>
            <DialogDescription>Update the details for {editingSupplier?.name || editingSupplier?.companyName}.</DialogDescription>
          </DialogHeader>
          {renderSupplierForm}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {supplierToDelete?.name || supplierToDelete?.companyName} and remove their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSupplier}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90" disabled={isDeletingSupplier}>
              {isDeletingSupplier && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeletingSupplier ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center"><Search className="mr-2 h-5 w-5 text-primary"/> Supplier List</CardTitle>
           <Input
              placeholder="Search by Name, Company, or Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-2"
              disabled={isSubmittingForm || isDeletingSupplier}
            />
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Supplier / Company</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Current Balance</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.length > 0 ? filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="font-medium">{supplier.companyName || supplier.name}</div>
                    {supplier.companyName && supplier.name && <div className="text-xs text-muted-foreground">({supplier.name})</div>}
                    {supplier.address && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{supplier.address}</p>}
                  </TableCell>
                  <TableCell>{supplier.contactPerson || "N/A"}</TableCell>
                  <TableCell>{supplier.phone}</TableCell>
                   <TableCell className={`${supplier.currentBalance > 0 ? 'text-destructive' : supplier.currentBalance < 0 ? 'text-green-600 dark:text-green-500' : 'text-foreground'}`}>
                      {formatCurrency(supplier.currentBalance, appSettings.currency, currencyForConversionSource)}
                      {supplier.currentBalance !== 0 && (
                        <span className="text-xs ml-1">
                          ({supplier.currentBalance > 0 ? 'You Owe' : 'Owes You'})
                        </span>
                      )}
                  </TableCell>
                  <TableCell>{formatDateAdded(supplier.dateAdded)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" onClick={() => handleOpenEditModal(supplier)} disabled={isSubmittingForm || isDeletingSupplier}>
                        <Edit3 className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8" onClick={() => handleOpenDeleteConfirm(supplier)} disabled={isSubmittingForm || isDeletingSupplier}>
                        <Trash2 className="h-4 w-4" />
                         <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                        {localSuppliers.length === 0 ? "No suppliers found. Add your first supplier!" : "No suppliers match your search."}
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
