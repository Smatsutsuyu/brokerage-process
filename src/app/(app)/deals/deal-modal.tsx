"use client";

import { useRouter } from "next/navigation";
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

import { createDeal, updateDeal, type DealPriority } from "./actions";

export type EditingDeal = {
  dealId: string;
  name: string;
  units: number | null;
  city: string | null;
  state: string | null;
  type: string | null;
  priority: DealPriority;
  notes: string | null;
};

type DealModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EditingDeal;
};

const PRIORITY_LABEL: Record<DealPriority, string> = {
  normal: "Normal",
  high: "High Priority",
};

export function DealModal({ open, onOpenChange, editing }: DealModalProps) {
  const router = useRouter();
  const isEdit = Boolean(editing);

  const [name, setName] = useState(editing?.name ?? "");
  const [units, setUnits] = useState<string>(editing?.units != null ? String(editing.units) : "");
  const [city, setCity] = useState(editing?.city ?? "");
  const [state, setState] = useState(editing?.state ?? "");
  const [type, setType] = useState(editing?.type ?? "");
  const [priority, setPriority] = useState<DealPriority>(editing?.priority ?? "normal");
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
          setUnits("");
          setCity("");
          setState("");
          setType("");
          setPriority("normal");
          setNotes("");
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setName(editing?.name ?? "");
    setUnits(editing?.units != null ? String(editing.units) : "");
    setCity(editing?.city ?? "");
    setState(editing?.state ?? "");
    setType(editing?.type ?? "");
    setPriority(editing?.priority ?? "normal");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Deal name is required.");
      return;
    }

    const unitsNum = units.trim() ? Number(units) : null;
    if (unitsNum != null && (!Number.isFinite(unitsNum) || unitsNum < 0)) {
      setError("Units must be a non-negative number.");
      return;
    }

    const payload = { name, units: unitsNum, city, state, type, priority, notes };

    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateDeal(editing.dealId, payload);
          onOpenChange(false);
        } else {
          const newId = await createDeal(payload);
          onOpenChange(false);
          router.push(`/deals/${newId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save deal.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Deal" : "New Deal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the deal's basic information and lifecycle phase."
              : "Create a new deal in the workspace. You can fill in the details now or come back later."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="deal-name">Deal name</Label>
            <Input
              id="deal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riverside Estates Phase 2"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="deal-units" className="text-gray-600">
                Units <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="deal-units"
                type="number"
                min={0}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder="e.g. 142"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deal-city" className="text-gray-600">
                City <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="deal-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Riverside"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deal-state" className="text-gray-600">
                State <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="deal-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. CA"
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="deal-type" className="text-gray-600">
              Type <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="deal-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Finished lots, Paper lots, Raw land"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="deal-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => v && setPriority(v as DealPriority)}
            >
              <SelectTrigger id="deal-priority">
                <SelectValue>{PRIORITY_LABEL[priority]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="deal-notes" className="text-gray-600">
              Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="deal-notes"
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
              {isEdit ? "Save changes" : "Create Deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
