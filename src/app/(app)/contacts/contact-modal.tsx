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

import { createContact, findOrCreateBuilder, updateContact } from "./actions";

export type BuilderOption = {
  id: string;
  name: string;
  classification: "private" | "public" | "developer";
};

export type EditingContact = {
  contactId: string;
  builderId: string | null;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  geography: string | null;
  notes: string | null;
};

type ContactModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  builders: BuilderOption[];
  // Edit mode when supplied, add mode otherwise.
  editing?: EditingContact;
};

// Sentinel for "no builder selected" — Select primitive needs a non-empty
// value, and we can't use undefined as an option. Empty string here so it
// sorts naturally to the top of the list.
const NO_BUILDER = "__none__";
const NEW_BUILDER = "__new__";

export function ContactModal({ open, onOpenChange, builders, editing }: ContactModalProps) {
  const isEdit = Boolean(editing);

  const [firstName, setFirstName] = useState(editing?.firstName ?? "");
  const [lastName, setLastName] = useState(editing?.lastName ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [geography, setGeography] = useState(editing?.geography ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [builderChoice, setBuilderChoice] = useState<string>(
    editing?.builderId ?? NO_BUILDER,
  );
  const [newBuilderName, setNewBuilderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setError(null);
        if (!editing) {
          setFirstName("");
          setLastName("");
          setTitle("");
          setEmail("");
          setPhone("");
          setGeography("");
          setNotes("");
          setBuilderChoice(NO_BUILDER);
          setNewBuilderName("");
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setFirstName(editing?.firstName ?? "");
    setLastName(editing?.lastName ?? "");
    setTitle(editing?.title ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setGeography(editing?.geography ?? "");
    setNotes(editing?.notes ?? "");
    setBuilderChoice(editing?.builderId ?? NO_BUILDER);
    setNewBuilderName("");
    setError(null);
  }, [open, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (builderChoice === NEW_BUILDER && !newBuilderName.trim()) {
      setError("Enter a name for the new builder, or pick {“}No builder{”}.");
      return;
    }

    startTransition(async () => {
      try {
        let builderId: string | null = null;
        if (builderChoice === NEW_BUILDER) {
          const r = await findOrCreateBuilder(newBuilderName);
          builderId = r.builderId;
        } else if (builderChoice !== NO_BUILDER) {
          builderId = builderChoice;
        }

        const data = {
          firstName,
          lastName,
          title,
          email,
          phone,
          geography,
          notes,
          builderId,
        };

        if (isEdit && editing) {
          await updateContact({ contactId: editing.contactId, data });
        } else {
          await createContact(data);
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save contact.");
      }
    });
  }

  const selectedBuilderLabel = (() => {
    if (builderChoice === NO_BUILDER) return "No builder";
    if (builderChoice === NEW_BUILDER) return "+ Create new builder";
    return builders.find((b) => b.id === builderChoice)?.name ?? "Pick a builder";
  })();

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this contact's details. Builder can be changed or cleared."
              : "Add a contact. Builder is optional — you can leave it unassigned and tie them to a company later."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="contact-first">First name</Label>
              <Input
                id="contact-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-last" className="text-gray-600">
                Last name <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="contact-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-builder">Builder</Label>
            <Select value={builderChoice} onValueChange={(v) => v && setBuilderChoice(v)}>
              <SelectTrigger id="contact-builder" className="w-full">
                <SelectValue>{selectedBuilderLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BUILDER}>No builder</SelectItem>
                <SelectItem value={NEW_BUILDER}>+ Create new builder</SelectItem>
                {builders.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {builderChoice === NEW_BUILDER && (
              <Input
                value={newBuilderName}
                onChange={(e) => setNewBuilderName(e.target.value)}
                placeholder="New builder name"
                className="mt-1"
              />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-title" className="text-gray-600">
              Title <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="contact-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. VP of Land Acquisition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="contact-email" className="text-gray-600">
                Email <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-phone" className="text-gray-600">
                Phone <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-geography" className="text-gray-600">
              Geography <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="contact-geography"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              placeholder="e.g. SoCal, Bay Area"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-notes" className="text-gray-600">
              Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="contact-notes"
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
              {isEdit ? "Save changes" : "Save Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
