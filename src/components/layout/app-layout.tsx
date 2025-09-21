
"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode, type FormEvent, Fragment, useEffect, useMemo, useCallback } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Icons } from '@/components/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LayoutDashboard, Archive, Users, ShoppingCart, Settings, LogOut, UserCircle, AreaChart, KeyRound, Mail, LockKeyhole, AtSign, ClipboardList, Truck, Receipt, ListChecks, Landmark, LineChart, FileText as FileTextIcon, PlusCircle, RotateCcw, PackageOpen, Users2, Banknote, ShoppingBag, DollarSign as DollarSignIcon, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { auth } from "@/lib/firebase/clientApp";
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { InitialSetupModal } from "./initial-setup-modal";
import { cn } from '@/lib/utils';


const LinearLoader = () => (
  <div className="fixed top-0 left-0 right-0 h-1 w-full z-[9999] overflow-hidden bg-primary/20">
    <div className="relative h-full w-full">
      <div className="absolute h-full w-full bg-primary animate-linear-loader" />
    </div>
  </div>
);


interface NavItemConfig {
  href?: string;
  label: string;
  icon: React.ElementType;
  subItems?: NavItemConfig[];
  isRoot?: boolean;
}

interface NavSectionConfig {
  id: string;
  title: string;
  icon: React.ElementType;
  items: NavItemConfig[];
}

const navSections: NavSectionConfig[] = [
  {
    id: "sales-management",
    title: "Sales Management",
    icon: ShoppingCart,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isRoot: true },
      { href: '/checkout', label: 'Sales Invoice', icon: ShoppingCart, isRoot: true },
      { href: '/inventory', label: 'Inventory', icon: Archive, isRoot: true },
      { href: '/customers', label: 'Customers', icon: Users, isRoot: true },
      { href: '/orders', label: 'Orders', icon: ClipboardList, isRoot: true },
    ]
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: LineChart,
    items: [
      { href: '/financial-overview', label: 'Financial Overview', icon: Landmark, isRoot: true },
      { href: '/reports', label: 'Reports', icon: AreaChart, isRoot: true },
    ]
  },
  {
    id: "returns-management",
    title: "Returns Management",
    icon: RotateCcw,
    items: [
      { href: '/returns', label: 'Record Return', icon: PlusCircle, isRoot: true },
      { href: '/returns/list', label: 'View Returns', icon: ListChecks, isRoot: true },
    ]
  },
  {
    id: "quotation-management",
    title: "Quotation Management",
    icon: FileTextIcon,
    items: [
      { href: '/quotations/add', label: 'Record Quotation', icon: PlusCircle, isRoot: true },
      { href: '/quotations', label: 'List Quotations', icon: ListChecks, isRoot: true },
    ]
  },
  {
    id: "supplier-management",
    title: "Supplier Management",
    icon: Truck,
    items: [
      { href: '/suppliers', label: 'Suppliers', icon: Users2, isRoot: true },
      {
        label: 'Purchases',
        icon: ShoppingBag,
        isRoot: false,
        subItems: [
          { href: '/purchases/add', label: 'Record Purchase', icon: PlusCircle },
          { href: '/purchases/list', label: 'View Invoices', icon: ListChecks },
        ]
      },
      {
        label: 'Payments',
        icon: Banknote,
        isRoot: false,
        subItems: [
          { href: '/payments/supplier/record', label: 'Record Payment', icon: PlusCircle },
          { href: '/payments/supplier/list', label: 'Payment History', icon: ListChecks },
        ]
      }
    ]
  },
];

const bottomNavItems: NavItemConfig[] = [
    { href: '/settings', label: 'Settings', icon: Settings, isRoot: true },
];

// Helper function to render navigation items (direct links or sub-groups)
const renderNavItems = (items: NavItemConfig[], pathname: string, handleLinkClick: (href?: string) => void) => {
  return items.map((item) => {
    if (item.href && item.isRoot) {
      return (
        <SidebarMenuItem key={item.label}>
          <SidebarMenuButton
            asChild
            isActive={item.href === pathname}
            className="w-full justify-start relative"
            variant="default"
            data-sidebar="menu-button"
          >
            <Link href={item.href} onClick={() => handleLinkClick(item.href)} className="hover:no-underline">
              <item.icon className="mr-2 h-5 w-5" />
              {item.label}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    } else if (item.subItems) {
      return ( // Return a fragment containing the group header and the sub-items
        <Fragment key={item.label}>
          <div className="flex items-center px-2 py-1.5 text-sm font-medium text-sidebar-foreground/70">
            <item.icon className="mr-2 h-5 w-5 text-primary" />
            <span>{item.label}</span>
          </div>
          {item.subItems.map(subItem => (
            <SidebarMenuItem key={subItem.href}>
              <SidebarMenuButton
                asChild
                isActive={subItem.href === pathname}
                className="w-full justify-start relative pl-2 text-sm" // Note the padding to indent
                variant="ghost"
                data-sidebar="menu-sub-button"
              >
                <Link href={subItem.href!} onClick={() => handleLinkClick(subItem.href)} className="hover:no-underline">
                  <subItem.icon className="mr-2 h-4 w-4" />
                  {subItem.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </Fragment>
      );
    }
    return null; // For items that are neither root links nor have sub-items
  });
};


export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading, isCoreDataLoading, appSettings, showInitialSetupModal, authError, refreshAuthContext } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailChangePassword, setEmailChangePassword] = useState("");
  const [isAuthOpLoading, setIsAuthOpLoading] = useState(false);
  const [isPageNavigating, setIsPageNavigating] = useState(false);
  const [loaderMessage, setLoaderMessage] = useState("Initializing App...");


  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initialOpenState: Record<string, boolean> = {};
    navSections.forEach(section => {
        const isActiveSection = section.items.some(item =>
            item.href === pathname ||
            (item.subItems && item.subItems.some(subItem => subItem.href === pathname))
        );
        initialOpenState[section.id] = isActiveSection;
    });
    return initialOpenState;
  });

  const toggleSection = (sectionId: string) => {
      setOpenSections(prev => ({
          ...prev,
          [sectionId]: !prev[sectionId]
      }));
  };

  useEffect(() => {
      let activeSectionId: string | null = null;
      for (const section of navSections) {
          const isActiveSection = section.items.some(item =>
              item.href === pathname ||
              (item.subItems && item.subItems.some(subItem => subItem.href === pathname))
          );
          if (isActiveSection) {
              activeSectionId = section.id;
              break;
          }
      }
      if (activeSectionId) {
          setOpenSections(prev => ({
              ...prev,
              [activeSectionId!]: true
          }));
      }
  }, [pathname]);


  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isWelcomePage = pathname === '/welcome';
  const isEmailVerifiedPage = pathname === '/auth/email-verified';
  const isPublicFullscreenPage = isAuthPage || isWelcomePage || isEmailVerifiedPage || pathname === '/';

  const displayGlobalLoader = (isAuthLoading || (user && isCoreDataLoading && !appSettings.hasCompletedInitialSetup)) && !authError && !isPublicFullscreenPage;

  useEffect(() => {
    setIsPageNavigating(false);
  }, [pathname]);

  useEffect(() => {
    if (isAuthLoading) {
      setLoaderMessage("Authenticating...");
    } else if (user && isCoreDataLoading && !appSettings.hasCompletedInitialSetup) {
      setLoaderMessage("Loading core data...");
    } else if (user && !isCoreDataLoading && !appSettings.hasCompletedInitialSetup) {
      setLoaderMessage("Finalizing setup...");
    } else {
      setLoaderMessage("Initializing App...");
    }
  }, [isAuthLoading, user, isCoreDataLoading, appSettings.hasCompletedInitialSetup]);

  const handleLogout = async () => {
    try {
      setIsPageNavigating(true);
      await signOut(auth);
      toast({ title: "Logged Out", description: "You have been successfully logged out." });
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: "Logout Error", description: "Failed to log out. Please try again.", variant: "destructive" });
      setIsPageNavigating(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) {
      toast({ title: "Error", description: "User not found or email missing.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Error", description: "New passwords do not match.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "New password must be at least 6 characters long.", variant: "destructive" });
      return;
    }

    setIsAuthOpLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      toast({ title: "Success", description: "Password updated successfully." });
      setIsChangePasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error: any) {
      console.error("Change password error:", error);
      let errorMessage = "Failed to update password.";
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = "Incorrect current password.";
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = "This operation is sensitive and requires recent authentication. Please log out and log back in.";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsAuthOpLoading(false);
    }
  };

  const handleChangeEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) {
      toast({ title: "Error", description: "User not found or email missing.", variant: "destructive" });
      return;
    }
     if (!newEmail.trim()) {
      toast({ title: "Error", description: "New email cannot be empty.", variant: "destructive" });
      return;
    }

    setIsAuthOpLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, emailChangePassword);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, newEmail);
      toast({ title: "Verification Sent", description: `A verification email has been sent to ${newEmail}. Please verify to complete the email change.` });
      setIsChangeEmailOpen(false);
      setNewEmail("");
      setEmailChangePassword("");
    } catch (error: any) {
      console.error("Change email error:", error);
      let errorMessage = "Failed to change email.";
       if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = "Incorrect password.";
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = "This operation is sensitive and requires recent authentication. Please log out and log back in.";
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = "This email address is already in use by another account.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "The new email address is not valid.";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsAuthOpLoading(false);
    }
  };

  const handleLinkClick = (href?: string) => {
    if (href && href !== pathname) {
      setIsPageNavigating(true);
    }
  };

  const getPageTitle = () => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.href && pathname === item.href) return item.label;
        if (item.subItems) {
          for (const subItem of item.subItems) {
            if (subItem.href && pathname === subItem.href) return subItem.label;
            if (subItem.href && pathname.startsWith(subItem.href) && subItem.href !== '/') {
              if (pathname.split('/').length > subItem.href.split('/').length && subItem.href.split('/').length > 2) return subItem.label;
            }
          }
        } else if (item.href && pathname.startsWith(item.href) && item.href !== '/') {
            if (pathname.split('/').length > item.href.split('/').length && item.href.split('/').length > 1) return item.label;
        }
      }
    }
    const bottomItem = bottomNavItems.find(item => item.href && item.href === pathname);
    if (bottomItem) return bottomItem.label;

    if (pathname === '/dashboard') return 'Dashboard';
    if (pathname === '/welcome') return 'Welcome to Salify';
    if (pathname === '/login') return 'Login';
    if (pathname === '/register') return 'Register';
    if (pathname === '/auth/email-verified') return 'Email Verified';

    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length -1];
        if (lastSegment !== 'add' && lastSegment !== 'list' && lastSegment !== 'record' && !/^[0-9a-fA-F]{20,}$/.test(lastSegment) && !/^[a-zA-Z0-9-]+-[a-zA-Z0-9-]+$/.test(lastSegment) && !/^[a-zA-Z0-9-]+$/.test(lastSegment)) {
             return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' ');
        } else if (pathSegments.length > 1) {
            const secondLastSegment = pathSegments[pathSegments.length - 2];
            return secondLastSegment.charAt(0).toUpperCase() + secondLastSegment.slice(1).replace(/-/g, ' ');
        }
    }
    return appSettings.companyDisplayName || 'Salify';
  };

  if (isPublicFullscreenPage) {
    if (authError && GlobalLoader) return <GlobalLoader error={authError} message="Application Error" />;
    return <>{children}</>;
  }

  if (displayGlobalLoader && GlobalLoader) {
    return <GlobalLoader message={loaderMessage} error={authError} />;
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center gap-2 group hover:no-underline" onClick={() => handleLinkClick('/dashboard')}>
            <Icons.Logo className="w-8 h-8 text-primary transition-transform group-hover:rotate-[20deg]" />
            <h1 className="text-xl font-semibold font-headline text-foreground">{appSettings.companyDisplayName || 'Salify'}</h1>
          </Link>
        </SidebarHeader>
        <ScrollArea className="flex-grow">
          <SidebarContent className="p-0">
            <div className="flex flex-col gap-0.5 p-2"> {/* Reduced gap for tighter sections */}
              {navSections.map((section) => (
                <div key={section.id} className="mb-1">
                  <button
                    onClick={() => toggleSection(section.id)}
                    className={cn(
                        "flex items-center justify-between w-full px-3 py-2.5 text-sm rounded-md",
                        "bg-sidebar-accent/30 text-sidebar-foreground/90 shadow-sm",
                        "hover:bg-sidebar-accent/50 transition-colors focus:outline-none focus:ring-2 focus:ring-sidebar-ring focus:ring-offset-1 focus:ring-offset-sidebar"
                    )}
                    aria-expanded={openSections[section.id]}
                    aria-controls={`section-content-${section.id}`}
                  >
                    <div className="flex items-center">
                      <section.icon className="mr-2 h-5 w-5 text-primary" />
                      <span className="font-medium">{section.title}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 text-sidebar-foreground/70 transition-transform duration-200",
                        openSections[section.id] && "rotate-180"
                      )}
                    />
                  </button>
                  {openSections[section.id] && (
                    <div id={`section-content-${section.id}`} className="pl-1 pt-1">
                      <SidebarMenu className="pb-1 pl-1 pr-1">
                        {renderNavItems(section.items, pathname, handleLinkClick)}
                      </SidebarMenu>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SidebarContent>
        </ScrollArea>
        <SidebarFooter className="p-2 border-t border-sidebar-border mt-auto">
          <SidebarMenu>
            {bottomNavItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                    asChild
                    isActive={item.href === pathname}
                    className="w-full justify-start relative"
                    variant="default"
                    data-sidebar="menu-button"
                    >
                    <Link href={item.href!} onClick={() => handleLinkClick(item.href)} className="hover:no-underline">
                        <item.icon className="mr-2 h-5 w-5" />
                        {item.label}
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton className="w-full justify-start hover:no-underline" variant="ghost" onClick={handleLogout}>
                <LogOut className="mr-2 h-5 w-5" /> Logout
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 backdrop-blur-sm px-4 md:px-6">
          <div className="md:hidden"><SidebarTrigger /></div>
          <div className="flex-1"><h2 className="text-xl font-semibold font-headline text-foreground">{getPageTitle()}</h2></div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary">
                <UserCircle className="h-10 w-10 text-primary hover:text-primary" /><span className="sr-only">User Profile</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.displayName || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setIsChangePasswordOpen(true)}><KeyRound className="mr-2 h-4 w-4" /><span>Change Password</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsChangeEmailOpen(true)}><Mail className="mr-2 h-4 w-4" /><span>Change Email</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /><span>Logout</span></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="relative flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-background">
          {isPageNavigating && !displayGlobalLoader && <LinearLoader />}
          {children}
        </main>
      </SidebarInset>

      <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center"><LockKeyhole className="mr-2 h-5 w-5 text-primary"/>Change Your Password</DialogTitle>
            <DialogDescription>Enter your current password and your new password below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 pt-2">
            <div><Label htmlFor="currentPassword">Current Password</Label><Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="mt-1" disabled={isAuthOpLoading}/></div>
            <div><Label htmlFor="newPassword">New Password</Label><Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className="mt-1" disabled={isAuthOpLoading}/></div>
            <div><Label htmlFor="confirmNewPassword">Confirm New Password</Label><Input id="confirmNewPassword" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required minLength={6} className="mt-1" disabled={isAuthOpLoading}/></div>
            <DialogFooter className="pt-4"><DialogClose asChild><Button type="button" variant="outline" disabled={isAuthOpLoading}>Cancel</Button></DialogClose><Button type="submit" disabled={isAuthOpLoading}>{isAuthOpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Password</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isChangeEmailOpen} onOpenChange={setIsChangeEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center"><AtSign className="mr-2 h-5 w-5 text-primary"/>Change Your Email</DialogTitle>
            <DialogDescription>Enter your new email address and current password. A verification link will be sent to your new email.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangeEmail} className="space-y-4 pt-2">
            <div><Label htmlFor="newEmail">New Email Address</Label><Input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="mt-1" disabled={isAuthOpLoading}/></div>
            <div><Label htmlFor="emailChangePassword">Current Password (for verification)</Label><Input id="emailChangePassword" type="password" value={emailChangePassword} onChange={(e) => setEmailChangePassword(e.target.value)} required className="mt-1" disabled={isAuthOpLoading}/></div>
            <DialogFooter className="pt-4"><DialogClose asChild><Button type="button" variant="outline" disabled={isAuthOpLoading}>Cancel</Button></DialogClose><Button type="submit" disabled={isAuthOpLoading}>{isAuthOpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Verification Email</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {user && !isAuthLoading && showInitialSetupModal && <InitialSetupModal />}
    </SidebarProvider>
  );
}

const GlobalLoader = ({ error, message }: { error?: string | null; message?: string }) => {
  if (error) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center p-6 text-center bg-background">
        <div className="bg-destructive/10 p-4 rounded-lg max-w-md">
          <h1 className="text-xl font-bold text-destructive mb-3">Application Error</h1>
          <p className="text-sm text-foreground mb-2">{error}</p>
          <p className="text-xs text-muted-foreground">
            Please check your Firebase project configuration and ensure all services (Authentication, Firestore) are correctly set up and enabled.
          </p>
        </div>
      </div>
    );
  }
  return <LinearLoader />;
};
