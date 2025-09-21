
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function EmailVerifiedPage() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleProceedToLogin = () => {
    setIsNavigating(true);
    router.push("/login");
  };

  // Optional: Add a small delay and auto-redirect
  useEffect(() => {
    const timer = setTimeout(() => {
      // Uncomment to enable auto-redirect
      // setIsNavigating(true);
      // router.push("/login");
    }, 50000); // Auto-redirect after 50 seconds (example, adjust as needed or remove)

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 bg-gradient-to-br from-background to-secondary/30">
      <Card className="w-full max-w-md shadow-2xl overflow-hidden relative">
        {isNavigating && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-lg">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )}
        <CardHeader className="text-center bg-primary/10 p-8">
          <div className="inline-block p-4 bg-green-100 dark:bg-green-800/30 rounded-full mb-6 border-4 border-green-200 dark:border-green-700 shadow-md">
            <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" strokeWidth={1.5} />
          </div>
          <CardTitle className="font-headline text-3xl text-foreground">Email Verified!</CardTitle>
          <CardDescription className="text-muted-foreground text-base pt-2">
            Your email address has been successfully verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-6 text-center">
          <p className="text-foreground">
            Thank you for verifying your email. You can now proceed to log in to your Salify account and start managing your business.
          </p>
          <Button 
            onClick={handleProceedToLogin} 
            className="w-full text-lg py-3 h-auto mt-4"
            disabled={isNavigating}
          >
            <LogIn className="mr-2 h-5 w-5" />
            Proceed to Login
          </Button>
          <p className="text-xs text-muted-foreground pt-4">
            If you are not redirected automatically, please click the button above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
