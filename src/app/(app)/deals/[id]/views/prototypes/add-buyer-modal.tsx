"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

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

import { addBuilderToDeal, addContact } from "../../actions";

import type { Classification, Tier } from "./load-buyers";

type AddBuyerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  // Existing builders to pick from. We don't currently support attaching an
  // existing org builder to a new deal (every deal-add creates a builder),
  // but the dropdown is here so the workflow is obvious to the user.
  // For now: only "+ Create new" is functional; existing-pick is a no-op stub.
  existingBuilderNames: string[];
};

const TIER_LABEL: Record<Tier, string> = {
  green: "Green — Interested",
  yellow: "Yellow — Evaluating",
  red: "Red — Immediate Pass",
  not_selected: "Not Selected",
};

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  private: "Private",
  public: "Public",
};

export function AddBuyerModal({
  open,
  onOpenChange,
  dealId,
  existingBuilderNames,
}: AddBuyerModalProps) {
  // Builder fields
  const [builderName, setBuilderName] = useState("");
  const [classification, setClassification] = useState<Classification>("private");
  const [tier, setTier] = useState<Tier>("not_selected");
  const [builderNotes, setBuilderNotes] = useState("");

  // Optional first-contact section
  const [addContactToo, setAddContactToo] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setBuilderName("");
        setClassification("private");
        setTier("not_selected");
        setBuilderNotes("");
        setAddContactToo(false);
        setFirstName("");
        setLastName("");
        setTitle("");
        setEmail("");
        setPhone("");
        setError(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  const isDuplicate =
    builderName.trim().length > 0 &&
    existingBuilderNames.some(
      (n) => n.toLowerCase() === builderName.trim().toLowerCase(),
    );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = builderName.trim();
    if (!name) {
      setError("Builder name is required.");
      return;
    }
    if (isDuplicate) {
      setError("That builder is already on this deal.");
      return;
    }
    if (addContactToo && (!firstName.trim() || !lastName.trim())) {
      setError("Contact first and last name are required.");
      return;
    }

    startTransition(async () => {
      try {
        const { builderId } = await addBuilderToDeal({
          dealId,
          name,
          classification,
          tier,
          notes: builderNotes,
        });

        if (addContactToo) {
          await addContact({
            dealId,
            builderId,
            firstName,
            lastName,
            title,
            email,
            phone,
          });
        }

        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add buyer.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Buyer</DialogTitle>
          <DialogDescription>
            Add a builder to this deal&rsquo;s buyer list, and optionally a first contact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="add-buyer-name">Builder / Company name</Label>
            <Input
              id="add-buyer-name"
              value={builderName}
              onChange={(e) => setBuilderName(e.target.value)}
              placeholder="e.g. Lennar"
              autoFocus
              required
            />
            {isDuplicate && (
              <p className="text-xs text-amber-700">Already on this deal.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-buyer-class">Type</Label>
              <Select
                value={classification}
                onValueChange={(v) => v && setClassification(v as Classification)}
              >
                <SelectTrigger id="add-buyer-class" className="w-full">
                  <SelectValue>{CLASSIFICATION_LABEL[classification]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-buyer-tier">Interest level</Label>
              <Select value={tier} onValueChange={(v) => v && setTier(v as Tier)}>
                <SelectTrigger id="add-buyer-tier" className="w-full">
                  <SelectValue>{TIER_LABEL[tier]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="green">Green — Interested</SelectItem>
                  <SelectItem value="yellow">Yellow — Evaluating</SelectItem>
                  <SelectItem value="red">Red — Immediate Pass</SelectItem>
                  <SelectItem value="not_selected">Not Selected on Deal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="add-buyer-notes" className="text-gray-600">
              Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="add-buyer-notes"
              value={builderNotes}
              onChange={(e) => setBuilderNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Optional first-contact section. Hidden behind a toggle so the
              modal stays compact for the common "I'll add contacts later" flow. */}
          <div
            className={cn(
              "rounded-lg border transition-colors",
              addContactToo ? "border-blue-200 bg-blue-50/30" : "border-gray-200",
            )}
          >
            <button
              type="button"
              onClick={() => setAddContactToo((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <Plus
                className={cn(
                  "h-4 w-4 transition-transform",
                  addContactToo && "rotate-45",
                )}
              />
              {addContactToo ? "Skip contact for now" : "Also add a contact"}
            </button>

            {addContactToo && (
              <div className="space-y-3 border-t border-blue-200 px-3 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="add-buyer-first" className="text-xs">First name</Label>
                    <Input
                      id="add-buyer-first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="add-buyer-last" className="text-xs">Last name</Label>
                    <Input
                      id="add-buyer-last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="add-buyer-title" className="text-xs">Title</Label>
                  <Input
                    id="add-buyer-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. VP of Land Acquisition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="add-buyer-email" className="text-xs">Email</Label>
                    <Input
                      id="add-buyer-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="add-buyer-phone" className="text-xs">Phone</Label>
                    <Input
                      id="add-buyer-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
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
              Save Buyer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
