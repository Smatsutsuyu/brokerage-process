"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { inviteMember, type Role } from "../actions";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  broker: "Broker",
  analyst: "Analyst",
  viewer: "Viewer",
};

type InviteMemberModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function generatePassword(): string {
  // Simple, memorable temp password (12 chars). Owner shares it with the
  // invitee out-of-band; they can change it from a profile page later.
  const adjectives = ["bright", "swift", "bold", "calm", "warm", "sharp"];
  const nouns = ["river", "meadow", "ridge", "harbor", "valley", "ledge"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${a}-${n}-${num}`;
}

export function InviteMemberModal({ open, onOpenChange }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("broker");
  const [initialPassword, setInitialPassword] = useState(generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setEmail("");
        setName("");
        setRole("broker");
        setInitialPassword(generatePassword());
        setError(null);
        setCreated(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !name.trim()) {
      setError("Email and name are required.");
      return;
    }
    if (initialPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      try {
        await inviteMember({ email, name, role, initialPassword });
        setCreated({ email: email.trim().toLowerCase(), password: initialPassword });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not invite member.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Adds a member to Lakebridge with an initial password. Share the credentials with them
            out-of-band.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Member added. Share these credentials:
            </div>
            <dl className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  Email
                </dt>
                <dd className="font-mono text-gray-900 select-text">{created.email}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  Initial password
                </dt>
                <dd className="font-mono text-gray-900 select-text">{created.password}</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500">
              They sign in at <code>/sign-in</code>. They should change their password after first
              sign-in (profile page coming soon).
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
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                required
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
                <SelectTrigger id="invite-role">
                  <SelectValue>{ROLE_LABEL[role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner — full access incl. member management</SelectItem>
                  <SelectItem value="broker">Broker — manage deals, contacts, documents</SelectItem>
                  <SelectItem value="analyst">Analyst — view + edit underwriting data</SelectItem>
                  <SelectItem value="viewer">Viewer — read-only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-password">Initial password</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-password"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  required
                  minLength={8}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInitialPassword(generatePassword())}
                >
                  Regen
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                You&rsquo;ll see this password again after creation so you can copy + share it.
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
                Invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
