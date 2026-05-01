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

import { addBuilderToDeal } from "../actions";

type AddBuilderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
};

type Classification = "private" | "public";
type Tier = "green" | "yellow" | "red" | "not_selected";

export function AddBuilderModal({ open, onOpenChange, dealId }: AddBuilderModalProps) {
  const [name, setName] = useState("");
  const [classification, setClassification] = useState<Classification>("private");
  const [tier, setTier] = useState<Tier>("not_selected");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName("");
        setClassification("private");
        setTier("not_selected");
        setNotes("");
        setError(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Builder name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await addBuilderToDeal({ dealId, name, classification, tier, notes });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add builder.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Builder to Deal</DialogTitle>
          <DialogDescription>
            Adds a builder/company to this deal&rsquo;s buyer list. You can add contacts at the new
            builder afterward.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="add-builder-name">Builder / Company name</Label>
            <Input
              id="add-builder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lennar"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-builder-class">Type</Label>
              <Select
                value={classification}
                onValueChange={(v) => v && setClassification(v as Classification)}
              >
                <SelectTrigger id="add-builder-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-builder-tier">Interest level</Label>
              <Select value={tier} onValueChange={(v) => v && setTier(v as Tier)}>
                <SelectTrigger id="add-builder-tier">
                  <SelectValue />
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
            <Label htmlFor="add-builder-notes" className="text-gray-600">
              Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="add-builder-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
              Save Builder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
