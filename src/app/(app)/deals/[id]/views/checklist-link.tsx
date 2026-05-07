"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Link as LinkIcon, Loader2, Pencil, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
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

import { clearChecklistItemLink, setChecklistItemLink } from "../actions";

export type ChecklistLinkData = {
  url: string;
  label: string | null;
};

type ChecklistLinkProps = {
  dealId: string;
  itemId: string;
  link: ChecklistLinkData | null;
  // Where the parent wants this rendered:
  // - "trigger" → the Link button in the main row's action area. Renders
  //   nothing when a link already exists (the link is shown in the
  //   sub-row instead).
  // - "display" → the link chip + edit/clear in the row's expanded
  //   sub-row beneath. Renders nothing when no link exists.
  slot: "trigger" | "display";
};

// Compact display label for an attached link. Prefers the user-supplied
// label; falls back to the host (e.g. "dropbox.com") so the chip stays
// readable even when no label is set.
function displayLabel(link: ChecklistLinkData): string {
  if (link.label) return link.label;
  try {
    const u = new URL(link.url);
    // Strip leading "www." for cleanliness.
    return u.host.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

export function ChecklistLink({ dealId, itemId, link, slot }: ChecklistLinkProps) {
  const [editing, setEditing] = useState(false);
  const [, startClear] = useTransition();
  const confirm = useConfirm();

  async function handleClear() {
    if (!link) return;
    const ok = await confirm({
      title: "Remove this link?",
      description: `${displayLabel(link)} will be unlinked from this item. The original document at the URL is unaffected.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    startClear(async () => {
      await clearChecklistItemLink({ itemId, dealId });
    });
  }

  // Trigger slot: only renders the "Link" button when no link is set yet.
  // When a link IS attached, the trigger slot is empty (the link chip
  // lives in the display slot below the row).
  if (slot === "trigger") {
    if (link) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700"
        >
          <LinkIcon className="h-3 w-3" />
          Link
        </button>
        <ChecklistLinkModal
          open={editing}
          onOpenChange={setEditing}
          dealId={dealId}
          itemId={itemId}
          existing={null}
        />
      </span>
    );
  }

  // Display slot: only renders when a link exists. Lives in the sub-row;
  // edit/clear stay visible at all times.
  if (!link) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        title={link.url}
        className="hover:bg-brand-blue/10 hover:text-brand-blue inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors"
      >
        <LinkIcon className="h-3 w-3" />
        <span className="max-w-[240px] truncate">{displayLabel(link)}</span>
        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
      </a>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit link"
        className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-amber-50 hover:text-amber-700"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={handleClear}
        title="Remove link"
        className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <ChecklistLinkModal
        open={editing}
        onOpenChange={setEditing}
        dealId={dealId}
        itemId={itemId}
        existing={link}
      />
    </span>
  );
}

type ChecklistLinkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  itemId: string;
  existing: ChecklistLinkData | null;
};

function ChecklistLinkModal({
  open,
  onOpenChange,
  dealId,
  itemId,
  existing,
}: ChecklistLinkModalProps) {
  const [url, setUrl] = useState(existing?.url ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setUrl(existing?.url ?? "");
        setLabel(existing?.label ?? "");
        setError(null);
      }, 150);
      return () => clearTimeout(t);
    }
    setUrl(existing?.url ?? "");
    setLabel(existing?.label ?? "");
    setError(null);
  }, [open, existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim()) {
      setError("URL is required");
      return;
    }
    startTransition(async () => {
      try {
        await setChecklistItemLink({ itemId, dealId, url, label });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save link");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit link" : "Link a document"}</DialogTitle>
          <DialogDescription>
            Paste a URL to an external file or folder (Dropbox, SharePoint, Google Drive — any
            link works). The platform doesn&rsquo;t copy or sync the file; users open it in a new
            tab.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.dropbox.com/scl/fo/..."
              autoFocus
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="link-label" className="text-gray-600">
              Label <span className="text-xs font-normal text-gray-400">(optional)</span>
            </Label>
            <Input
              id="link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. HOA Budget folder"
            />
            <p className="text-[11px] text-gray-500">
              If blank, the chip shows the link&rsquo;s host (e.g. dropbox.com).
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
              {existing ? "Save changes" : "Save link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
