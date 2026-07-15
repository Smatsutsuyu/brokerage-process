"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resetMemberPassword } from "../actions";

// Mirrors the temp-password generator in invite-member-modal so both flows
// produce credentials in the same shape (adjective-noun-###).
function generatePassword(): string {
  const adjectives = ["bright", "swift", "bold", "calm", "warm", "sharp"];
  const nouns = ["river", "meadow", "ridge", "harbor", "valley", "ledge"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${a}-${n}-${num}`;
}

type ResetPasswordModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; name: string; email: string } | null;
};

export function ResetPasswordModal({ open, onOpenChange, member }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      // Wait for the dialog close animation so state doesn't flicker.
      const t = setTimeout(() => {
        setNewPassword(generatePassword());
        setError(null);
        setDone(null);
        setCopied(false);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      try {
        await resetMemberPassword({ userId: member.id, newPassword });
        setDone({ email: member.email, password: newPassword });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reset password.");
      }
    });
  }

  async function copyPassword() {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (rare in Chromium contexts we ship to) — the
      // password is visible on screen, so the owner can still copy manually.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {member
              ? `Give ${member.name || member.email} a new temporary password. They'll be forced to set their own password the next time they sign in.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Password reset. Share these credentials:
            </div>
            <dl className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  Email
                </dt>
                <dd className="font-mono text-gray-900 select-text">{done.email}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  Temporary password
                </dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-gray-900 select-text">{done.password}</span>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? "Copied" : "Copy"}
                  </button>
                </dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500">
              Any active session on this account was signed out. On next sign-in the member is
              prompted to choose a new password of their own before they can enter the app.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="reset-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input
                  id="reset-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="font-mono"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  Regen
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                You&rsquo;ll see this again after reset so you can copy + share it.
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Reset password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
