
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Mail, KeyRound, UserCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, type User, updateProfile } from "firebase/auth";
import { auth, firebaseInitializationError as GlobalFirebaseInitializationError } from "@/lib/firebase/clientApp";
import { generateActivityEntryForUser } from "@/lib/services/activity-log-service";

interface PasswordValidationErrors {
  length?: string;
  uppercase?: string;
  lowercase?: string;
  number?: string;
  specialChar?: string;
}

export default function RegisterPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPageNavigating, setIsPageNavigating] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<PasswordValidationErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validatePassword = (pass: string): boolean => {
    const errors: PasswordValidationErrors = {};
    if (pass.length < 8) {
      errors.length = "Password must be at least 8 characters long.";
    }
    if (!/(?=.*[a-z])/.test(pass)) {
      errors.lowercase = "Password must contain at least one lowercase letter.";
    }
    if (!/(?=.*[A-Z])/.test(pass)) {
      errors.uppercase = "Password must contain at least one uppercase letter.";
    }
    if (!/(?=.*\d)/.test(pass)) {
      errors.number = "Password must contain at least one number.";
    }
    if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(pass)) {
      errors.specialChar = "Password must contain at least one special character.";
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setPasswordErrors({});

    if (GlobalFirebaseInitializationError) {
      toast({
        title: "System Error",
        description: `Firebase initialization failed: ${GlobalFirebaseInitializationError.message}. Please contact support or check configuration.`,
        variant: "destructive",
        duration: 10000,
      });
      setIsSubmitting(false);
      return;
    }

    if (!auth) {
      toast({
        title: "Authentication Service Error",
        description: "Firebase Auth service is not available. Please check Firebase setup.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!validatePassword(password)) {
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user as User;

      await updateProfile(newUser, {
        displayName: name.trim(),
      });

      await sendEmailVerification(newUser);

      await signOut(auth);

      toast({
        title: "Registration Almost Complete for Salify!",
        description: "A verification email has been sent. Please check your inbox (and spam folder) and click the link from Salify to activate your account. Then, you can log in.",
        duration: 10000,
      });
      router.push("/login?status=verification_sent");
    } catch (error: any) {
      console.error("Registration error:", error);
      const errorCode = error.code;
      let toastTitle = "Registration Error";
      let errorMessage = "Failed to register. Please try again.";
      if (errorCode === 'auth/email-already-in-use') {
        toastTitle = "Email In Use";
        errorMessage = "This email address is already registered. Please try logging in or use a different email.";
      } else if (errorCode === 'auth/invalid-email') {
        toastTitle = "Invalid Email Format";
        errorMessage = "The email address you entered is not valid.";
      } else if (errorCode === 'auth/weak-password') {
        toastTitle = "Weak Password";
        errorMessage = "The password is too weak. Please choose a stronger password that meets the requirements.";
      } else if (errorCode === 'auth/configuration-not-found') {
        toastTitle = "Configuration Error";
        errorMessage = "Firebase Authentication (Email/Password provider) is not enabled in your Firebase project. Please enable it in the Firebase console.";
      }
      toast({
        title: toastTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className={`w-full max-w-md shadow-xl ${isPageNavigating ? 'relative' : ''}`}>
        {isPageNavigating && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-lg">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )}
        <CardHeader className="text-center">
           <div className="inline-block p-3 bg-primary/10 rounded-lg mb-4">
            <UserPlus className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="font-headline text-3xl">Create Your Account</CardTitle>
          <CardDescription>Join Salify to manage your business efficiently.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center"><UserCircle className="mr-2 h-4 w-4 text-muted-foreground"/>Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSubmitting || isPageNavigating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground"/>Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting || isPageNavigating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center"><KeyRound className="mr-2 h-4 w-4 text-muted-foreground"/>Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (e.target.value) validatePassword(e.target.value); else setPasswordErrors({});
                  }}
                  required
                  minLength={8}
                  disabled={isSubmitting || isPageNavigating}
                  aria-describedby="password-errors"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                  disabled={isSubmitting || isPageNavigating}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                </Button>
              </div>
              {Object.values(passwordErrors).length > 0 && (
                <div id="password-errors" className="text-xs text-destructive space-y-0.5 mt-1">
                  {Object.values(passwordErrors).map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="flex items-center"><KeyRound className="mr-2 h-4 w-4 text-muted-foreground"/>Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isSubmitting || isPageNavigating}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  disabled={isSubmitting || isPageNavigating}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">{showConfirmPassword ? "Hide password" : "Show password"}</span>
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full text-lg py-3 h-auto" disabled={isSubmitting || isPageNavigating}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : null}
              {isSubmitting ? "Creating Account..." : "Create Account & Send Verification"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
              onClick={() => setIsPageNavigating(true)}
            >
              Sign in here
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
