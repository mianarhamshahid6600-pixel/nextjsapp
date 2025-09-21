
"use client"; 

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, isLoading, authError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !authError) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/welcome');
      }
    }
  }, [user, isLoading, authError, router]);

  if (authError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center p-6 text-center">
        <div className="bg-destructive/10 p-4 rounded-lg max-w-md">
          <h1 className="text-xl font-bold text-destructive mb-3">Authentication System Error</h1>
          <p className="text-sm text-foreground mb-2">{authError}</p>
          <p className="text-xs text-muted-foreground">
            Please ensure your Firebase project is correctly configured (API keys, enabled Authentication & Firestore services) and the details in <code>src/lib/firebase/clientApp.ts</code> are accurate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-4 text-lg">Loading...</p>
    </div>
  );
}
