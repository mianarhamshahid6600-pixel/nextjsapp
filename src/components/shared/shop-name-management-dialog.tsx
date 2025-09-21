
"use client";

import { useState, useMemo, type Dispatch, type SetStateAction, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; // Added import for Label
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building, Search, PlusCircle, Edit3, Trash2, Save, Loader2 } from "lucide-react";
import type { AppSettings } from "@/lib/data-types";
import { useToast } from "@/hooks/use-toast";
import { updateAppSettingsInFirestore } from "@/lib/services/app-settings-service";
import { useAuth } from "@/contexts/auth-context";

interface ShopNameManagementDialogProps {
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  appSettings: AppSettings;
  onSelectShopName?: (shopName: string) => void; // Optional: if selection is needed from dialog
  onShopNamesUpdated: () => Promise<void>; // Callback to refresh app settings in parent
}

export function ShopNameManagementDialog({
  isOpen,
  onOpenChange,
  appSettings,
  onSelectShopName,
  onShopNamesUpdated,
}: ShopNameManagementDialogProps) {
  const { toast } = useToast();
  const { userId } = useAuth();
  const [localKnownShopNames, setLocalKnownShopNames] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newShopName, setNewShopName] = useState("");
  const [editingShopName, setEditingShopName] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (appSettings?.knownShopNames) {
      setLocalKnownShopNames([...appSettings.knownShopNames].sort((a, b) => a.localeCompare(b)));
    } else {
      setLocalKnownShopNames([]);
    }
  }, [appSettings?.knownShopNames, isOpen]);

  const filteredShopNames = useMemo(() => {
    if (!searchTerm.trim()) {
      return localKnownShopNames;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return localKnownShopNames.filter((name) =>
      name.toLowerCase().includes(lowerSearchTerm)
    );
  }, [localKnownShopNames, searchTerm]);

  const handleAddShopName = async () => {
    if (!userId || !newShopName.trim()) {
      toast({ title: "Error", description: "Shop name cannot be empty.", variant: "destructive" });
      return;
    }
    if (localKnownShopNames.map(s => s.toLowerCase()).includes(newShopName.trim().toLowerCase())) {
      toast({ title: "Shop Name Exists", description: `"${newShopName.trim()}" already exists.`, variant: "default" });
      setNewShopName("");
      return;
    }
    setIsProcessing(true);
    const updatedNames = [...localKnownShopNames, newShopName.trim()].sort((a,b) => a.localeCompare(b));
    try {
      await updateAppSettingsInFirestore(userId, appSettings, { knownShopNames: updatedNames });
      toast({ title: "Shop Name Added", description: `"${newShopName.trim()}" added.` });
      setNewShopName("");
      await onShopNamesUpdated(); // Refresh parent state
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add shop name.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartEdit = (shopName: string) => {
    setEditingShopName(shopName);
    setEditedValue(shopName);
  };

  const handleSaveEdit = async () => {
    if (!userId || !editingShopName || !editedValue.trim()) {
      toast({ title: "Error", description: "New shop name cannot be empty.", variant: "destructive" });
      return;
    }
    if (editedValue.trim().toLowerCase() !== editingShopName.toLowerCase() &&
        localKnownShopNames.map(s => s.toLowerCase()).includes(editedValue.trim().toLowerCase())) {
      toast({ title: "Shop Name Exists", description: `Another shop named "${editedValue.trim()}" already exists.`, variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    const updatedNames = localKnownShopNames.map(name => 
      name === editingShopName ? editedValue.trim() : name
    ).sort((a,b) => a.localeCompare(b));
    try {
      await updateAppSettingsInFirestore(userId, appSettings, { knownShopNames: updatedNames });
      toast({ title: "Shop Name Updated", description: `"${editingShopName}" updated to "${editedValue.trim()}".` });
      setEditingShopName(null);
      setEditedValue("");
      await onShopNamesUpdated();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update shop name.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteShopName = async (shopNameToDelete: string) => {
    if (!userId) return;
    setIsProcessing(true);
    const updatedNames = localKnownShopNames.filter(name => name !== shopNameToDelete);
    try {
      await updateAppSettingsInFirestore(userId, appSettings, { knownShopNames: updatedNames });
      toast({ title: "Shop Name Deleted", description: `"${shopNameToDelete}" removed.` });
      if (editingShopName === shopNameToDelete) {
          setEditingShopName(null);
          setEditedValue("");
      }
      await onShopNamesUpdated();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete shop name.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDialogSelect = (shopName: string) => {
    if (onSelectShopName) {
      onSelectShopName(shopName);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { onOpenChange(open); if (!open) { setSearchTerm(""); setEditingShopName(null); setNewShopName(""); } }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center"><Building className="mr-2 h-5 w-5 text-primary" />Manage Shop Names</DialogTitle>
          <DialogDescription>Add, edit, or delete shop names for Instant Sales.</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-2">
            <div className="flex gap-2 items-end">
                <div className="flex-grow">
                    <Label htmlFor="newShopNameInput">Add New Shop Name</Label>
                    <Input
                        id="newShopNameInput"
                        value={newShopName}
                        onChange={(e) => setNewShopName(e.target.value)}
                        placeholder="Enter new shop name"
                        disabled={isProcessing || !!editingShopName}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddShopName();}}}
                        className="mt-1"
                    />
                </div>
                <Button onClick={handleAddShopName} disabled={isProcessing || !!editingShopName || !newShopName.trim()} className="h-10">
                    {isProcessing && !editingShopName ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                    Add
                </Button>
            </div>

             {editingShopName && (
                <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                    <Label htmlFor="editShopNameValueInput" className="font-semibold">Editing: {editingShopName}</Label>
                    <Input
                        id="editShopNameValueInput"
                        value={editedValue}
                        onChange={(e) => setEditedValue(e.target.value)}
                        placeholder="New shop name"
                        disabled={isProcessing}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit();}}}
                        className="mt-1"
                    />
                    <div className="flex gap-2 justify-end mt-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingShopName(null)} disabled={isProcessing}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveEdit} disabled={isProcessing || !editedValue.trim() || editedValue.trim() === editingShopName}>
                            {isProcessing && editingShopName ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            Save Edit
                        </Button>
                    </div>
                </div>
            )}
        </div>


        <div className="relative my-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search shop names..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
                disabled={!!editingShopName}
            />
        </div>
        <ScrollArea className="flex-grow border rounded-md min-h-[200px]">
          {filteredShopNames.length > 0 ? (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Shop Name</TableHead>
                  <TableHead className="w-[120px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShopNames.map((name) => (
                  <TableRow key={name}>
                    <TableCell className="cursor-pointer hover:underline" onClick={() => handleDialogSelect(name)}>
                        {name}
                    </TableCell>
                    <TableCell className="text-center space-x-1">
                       <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEdit(name)} title={`Edit ${name}`} disabled={isProcessing || !!editingShopName}>
                            <Edit3 className="h-4 w-4"/>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteShopName(name)} title={`Delete ${name}`} disabled={isProcessing || !!editingShopName}>
                            <Trash2 className="h-4 w-4"/>
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {localKnownShopNames.length === 0 ? "No shop names saved yet." : "No shop names match your search."}
            </div>
          )}
        </ScrollArea>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

