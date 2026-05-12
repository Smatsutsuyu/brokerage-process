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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { createBuilder, updateBuilder, type Classification } from "./actions";

export type EditingBuilder = {
  builderId: string;
  name: string;
  classification: Classification;
  notes: string | null;
};

type BuilderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditingBuilder;
};

const CLASSIFICATION_HELP: Record<Classification, string> = {
  private: "Private — privately held (e.g. Intracorp, Shea, New Home Co.)",
  public: "Public — publicly traded (e.g. Lennar, Pulte, KB Home)",
  developer: "Developer — land developer (entitles + sells land, doesn't build homes)",
};

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  private: "Private",
  public: "Public",
  developer: "Developer",
};

export function BuilderModal({ open, onOpenChange, editing }: BuilderModalProps) {
  const isEdit = Boolean(editing);

  const [name, setName] = useState(editing?.name ?? "");
  const [classification, setClassification] = useState<Classification>(
    editing?.classification ?? "private",
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setError(null);
        if (!editing) {
          setName("");
          setClassification("private");
          setNotes("");
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setName(editing?.name ?? "");
    setClassification(editing?.classification ?? "private");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Builder name is required.");
      return;
    }
    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateBuilder({
            builderId: editing.builderId,
            data: { name, classification, notes },
          });
        } else {
          await createBuilder({ name, classification, notes });
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save builder.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Builder" : "Add Builder"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the builder's name and classification."
              : "Add a builder to the org directory. You can attach contacts to them on the Contacts page or from any deal's Contacts tab."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="builder-name">Builder name</Label>
            <Input
              id="builder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lennar"
              autoFocus
              required
            />
          </div>

          <div className="grid gap-2">
            <Label>Classification</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["private", "public", "developer"] satisfies Classification[]).map((value) => {
                const isActive = value === classification;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setClassification(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-brand-blue bg-blue-50 text-brand-blue"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                    )}
                  >
                    {CLASSIFICATION_LABEL[value]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500">{CLASSIFICATION_HELP[classification]}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="builder-notes" className="text-gray-600">
              Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="builder-notes"
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
              {isEdit ? "Save changes" : "Save Builder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
