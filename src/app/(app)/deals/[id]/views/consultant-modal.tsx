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

import {
  addConsultant,
  updateConsultant,
  type ConsultantRole,
  type ConsultantSide,
} from "../actions";

import { CONSULTANT_ROLES, ROLE_LABEL, SIDE_LABEL } from "./consultant-roles";

export type EditingConsultant = {
  consultantId: string;
  role: ConsultantRole;
  side: ConsultantSide;
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
};

type ConsultantModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  defaultRole?: ConsultantRole;
  editing?: EditingConsultant;
};

export function ConsultantModal({
  open,
  onOpenChange,
  dealId,
  defaultRole,
  editing,
}: ConsultantModalProps) {
  const isEdit = Boolean(editing);

  const [role, setRole] = useState<ConsultantRole>(
    editing?.role ?? defaultRole ?? "civil_engineer",
  );
  const [side, setSide] = useState<ConsultantSide>(editing?.side ?? "seller");
  const [firmName, setFirmName] = useState(editing?.firmName ?? "");
  const [contactName, setContactName] = useState(editing?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(editing?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(editing?.contactPhone ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setError(null);
        if (!editing) {
          setFirmName("");
          setContactName("");
          setContactEmail("");
          setContactPhone("");
          setNotes("");
          setSide("seller");
        }
      }, 150);
      return () => clearTimeout(t);
    }
    setRole(editing?.role ?? defaultRole ?? "civil_engineer");
    setSide(editing?.side ?? "seller");
    setFirmName(editing?.firmName ?? "");
    setContactName(editing?.contactName ?? "");
    setContactEmail(editing?.contactEmail ?? "");
    setContactPhone(editing?.contactPhone ?? "");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, defaultRole, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firmName.trim()) {
      setError("Firm name is required.");
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          dealId,
          role,
          side,
          firmName,
          contactName,
          contactEmail,
          contactPhone,
          notes,
        };
        if (isEdit && editing) {
          await updateConsultant({ ...payload, consultantId: editing.consultantId });
        } else {
          await addConsultant(payload);
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save consultant.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Consultant" : "Add Consultant"}</DialogTitle>
          <DialogDescription>
            Roster of professionals working on this deal — informational metadata used for
            distribution lists and contact lookup.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="consultant-role">Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as ConsultantRole)}>
                <SelectTrigger id="consultant-role">
                  <SelectValue>{ROLE_LABEL[role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CONSULTANT_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="consultant-side">Side</Label>
              <Select value={side} onValueChange={(v) => v && setSide(v as ConsultantSide)}>
                <SelectTrigger id="consultant-side">
                  <SelectValue>{SIDE_LABEL[side]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller-side</SelectItem>
                  <SelectItem value="buyer">Buyer-side</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="consultant-firm">Firm / Company</Label>
            <Input
              id="consultant-firm"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="e.g. Hunsaker & Associates"
              autoFocus
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="consultant-contact" className="text-gray-600">
              Contact name <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="consultant-contact"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="consultant-email" className="text-gray-600">
                Email <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="consultant-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="consultant-phone" className="text-gray-600">
                Phone <span className="text-xs font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="consultant-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="consultant-notes" className="text-gray-600">
              Notes <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="consultant-notes"
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
              {isEdit ? "Save changes" : "Save Consultant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
