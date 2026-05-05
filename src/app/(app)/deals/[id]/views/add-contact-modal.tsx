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
import { cn } from "@/lib/utils";

import { addContact, updateContact } from "../actions";

export type BuilderOption = {
  id: string;
  name: string;
};

export type EditingContact = {
  contactId: string;
  builderId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type AddContactModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  builders: BuilderOption[];
  defaultBuilderId?: string;
  // Pass an existing contact to put the modal in edit mode.
  editing?: EditingContact;
};

// Sentinel value for the "Create new builder" select option. Picking it
// reveals an inline name input and routes the submit through a path that
// creates the builder + adds it to the deal before inserting the contact.
const NEW_BUILDER = "__new__";

export function AddContactModal({
  open,
  onOpenChange,
  dealId,
  builders,
  defaultBuilderId,
  editing,
}: AddContactModalProps) {
  const isEdit = Boolean(editing);

  const [builderChoice, setBuilderChoice] = useState<string>(
    editing?.builderId ?? defaultBuilderId ?? builders[0]?.id ?? NEW_BUILDER,
  );
  const [newBuilderName, setNewBuilderName] = useState("");
  const [newBuilderClassification, setNewBuilderClassification] = useState<
    "private" | "public"
  >("private");
  const [firstName, setFirstName] = useState(editing?.firstName ?? "");
  const [lastName, setLastName] = useState(editing?.lastName ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  // Reset / re-prefill on open. When editing, pre-fill from `editing`.
  // When adding, clear all fields. Runs after open transitions so the
  // modal animates from a stable snapshot.
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
          setNotes("");
          setNewBuilderName("");
          setNewBuilderClassification("private");
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setBuilderChoice(
      editing?.builderId ?? defaultBuilderId ?? builders[0]?.id ?? NEW_BUILDER,
    );
    setNewBuilderName("");
    setNewBuilderClassification("private");
    setFirstName(editing?.firstName ?? "");
    setLastName(editing?.lastName ?? "");
    setTitle(editing?.title ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, defaultBuilderId, builders, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const isNewBuilder = builderChoice === NEW_BUILDER;
    if (!isNewBuilder && !builderChoice) {
      setError("Pick a builder.");
      return;
    }
    if (isNewBuilder && !newBuilderName.trim()) {
      setError("Enter a name for the new builder.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateContact({
            dealId,
            contactId: editing.contactId,
            firstName,
            lastName,
            title,
            email,
            phone,
            notes,
          });
        } else {
          await addContact({
            dealId,
            // One of the two is set per the validation above.
            builderId: isNewBuilder ? undefined : builderChoice,
            newBuilderName: isNewBuilder ? newBuilderName : undefined,
            newBuilderClassification: isNewBuilder ? newBuilderClassification : undefined,
            firstName,
            lastName,
            title,
            email,
            phone,
            notes,
          });
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save contact.");
      }
    });
  }

  const selectedBuilderLabel = (() => {
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
              ? "Update this contact's details. To move them to a different builder, delete and re-add."
              : "Add a person at a builder. Pick an existing builder or create a new one and add it to the deal in one step."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="add-contact-builder">Builder</Label>
            <Select
              value={builderChoice}
              onValueChange={(v) => v && setBuilderChoice(v)}
              disabled={isEdit}
            >
              <SelectTrigger id="add-contact-builder" className="w-full">
                <SelectValue placeholder="Pick a builder">{selectedBuilderLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_BUILDER}>+ Create new builder</SelectItem>
                {builders.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {builderChoice === NEW_BUILDER && (
              <div className="mt-1 space-y-2 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
                <Input
                  value={newBuilderName}
                  onChange={(e) => setNewBuilderName(e.target.value)}
                  placeholder="New builder name (e.g. Lennar)"
                  className="bg-white"
                />
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-gray-700">
                    Classification
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["private", "public"] as const).map((value) => {
                      const isActive = value === newBuilderClassification;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setNewBuilderClassification(value)}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                            isActive
                              ? "border-brand-blue bg-brand-blue text-white"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                          )}
                        >
                          {value === "private" ? "Private" : "Public"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
              {isEdit ? "Save changes" : "Save Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
