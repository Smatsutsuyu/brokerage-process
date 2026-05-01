"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/auth-client";

export function SignOutButton() {
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    if (isPending) return;
    setIsPending(true);
    try {
      await signOut();
      window.location.href = "/sign-in";
    } catch (err) {
      console.error("Sign out failed", err);
      setIsPending(false);
      alert(`Sign out failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={handleSignOut} disabled={isPending}>
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LogOut className="h-3.5 w-3.5" />
      )}
      Sign out
    </Button>
  );
}
