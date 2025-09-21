
"use client";

import { useState, type FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { LogIn, Mail, KeyRound, ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, firebaseInitializationError as GlobalFirebaseInitializationError } from "@/lib/firebase/clientApp";

export default function LoginPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isNotRobot, setIsNotRobot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPageNavigating, setIsPageNavigating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Removed useEffect that showed the "Verification Email Sent" toast
  // useEffect(() => {
  //   const status = searchParams.get('status');
  //   if (status === 'verification_sent') {
  //     toast({
  //       title: "Verification Email Sent",
  //       description: "Please check your email inbox (and spam folder) to verify your account before logging in.",
  //       variant: "default",
  //       duration: 10000,
  //     });
  //   }
  // }, [searchParams, toast]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

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

    if (!isNotRobot) {
      toast({
        title: "Verification Required",
        description: "Please confirm you are not a robot.",
        variant: "destructive",
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

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        await signOut(auth);
        toast({
          title: "Email Not Verified",
          description: "Your email address has not been verified. Please check your inbox for the verification link. A new verification email can be sent if needed from the registration process.",
          variant: "destructive",
          duration: 10000,
        });
        setIsSubmitting(false);
        return;
      }

      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Login error:", error);
      const errorCode = error.code;
      let toastTitle = "Login Error";
      let errorMessage = "Failed to sign in. Please check your credentials.";
       if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        toastTitle = "Invalid Credentials";
        errorMessage = "Invalid email or password provided. Please try again.";
      } else if (errorCode === 'auth/invalid-email') {
        toastTitle = "Invalid Email Format";
        errorMessage = "The email address you entered is not valid.";
      } else if (errorCode === 'auth/too-many-requests') {
        toastTitle = "Access Temporarily Disabled";
        errorMessage = "Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.";
      } else if (errorCode === 'auth/user-disabled') {
        toastTitle = "Account Disabled";
        errorMessage = "This user account has been disabled.";
      } else if (errorCode === 'auth/visibility-check-was-unavailable' || (error.message && error.message.includes('visibility-check-was-unavailable'))) {
        toastTitle = "Temporary Login Issue";
        errorMessage = "A temporary issue occurred during login (visibility check unavailable). Please try again in a moment. If the problem persists, check your network or browser extensions.";
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
            <LogIn className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="font-headline text-3xl">Welcome Back!</CardTitle>
          <CardDescription>Sign in to access your Salify dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isSubmitting || isPageNavigating}
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
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="not-robot-checkbox"
                checked={isNotRobot}
                onCheckedChange={(checked) => setIsNotRobot(checked as boolean)}
                disabled={isSubmitting || isPageNavigating}
              />
              <Label htmlFor="not-robot-checkbox" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center">
                <ShieldCheck className="mr-2 h-4 w-4 text-muted-foreground" /> I am not a robot
              </Label>
            </div>
            <Button type="submit" className="w-full text-lg py-3 h-auto" disabled={isSubmitting || isPageNavigating}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : null}
              {isSubmitting ? "Signing In..." : "Sign In"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
              onClick={() => setIsPageNavigating(true)}
            >
              Register here
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
