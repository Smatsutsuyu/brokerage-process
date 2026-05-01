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
import { Textarea } from "@/components/ui/textarea";

import { addContact } from "../actions";

export type BuilderOption = {
  id: string;
  name: string;
};

type AddContactModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  builders: BuilderOption[];
  defaultBuilderId?: string;
};

export function AddContactModal({
  open,
  onOpenChange,
  dealId,
  builders,
  defaultBuilderId,
}: AddContactModalProps) {
  const [builderId, setBuilderId] = useState<string>(defaultBuilderId ?? builders[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset form fields after the close animation finishes — keeps the modal
  // body from visually clearing mid-transition. Setting state inside an
  // effect is intentional here (legitimate reset, not derived state).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setFirstName("");
        setLastName("");
        setTitle("");
        setEmail("");
        setPhone("");
        setNotes("");
        setError(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Sync builder when the modal opens — handles the case where the parent
  // changes defaultBuilderId between opens.
  useEffect(() => {
    if (open) setBuilderId(defaultBuilderId ?? builders[0]?.id ?? "");
  }, [open, defaultBuilderId, builders]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!builderId) {
      setError("Pick a builder.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    startTransition(async () => {
      try {
        await addContact({
          dealId,
          builderId,
          firstName,
          lastName,
          title,
          email,
          phone,
          notes,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add contact.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Add a person at a builder that&rsquo;s already on this deal. To add a brand-new builder
            or one not yet on the deal, that flow is coming.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="add-contact-builder">Builder</Label>
            <Select value={builderId} onValueChange={(v) => setBuilderId(v ?? "")}>
              <SelectTrigger id="add-contact-builder">
                <SelectValue placeholder="Pick a builder" />
              </SelectTrigger>
              <SelectContent>
                {builders.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-contact-first">First name</Label>
              <Input
                id="add-contact-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-contact-last">Last name</Label>
              <Input
                id="add-contact-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="add-contact-title" className="text-gray-600">
              Title <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="add-contact-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. VP of Land Acquisition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-contact-email" className="text-gray-600">
                Email <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="add-contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-contact-phone" className="text-gray-600">
                Phone <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="add-contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="add-contact-notes" className="text-gray-600">
              Comments <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="add-contact-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
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
              Save Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
