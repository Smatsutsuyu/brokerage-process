"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ChevronDown,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

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
import { cn } from "@/lib/utils";

import {
  addChecklistItemLink,
  deleteChecklistItemLink,
  updateChecklistItemLink,
} from "../actions";

export type AttachedLink = {
  id: string;
  url: string;
  label: string | null;
};

// Same overflow threshold as the docs list — a few inline chips before the
// tail collapses behind "+N more."
const INLINE_LIMIT = 3;

type ChecklistLinkProps = {
  dealId: string;
  itemId: string;
  links: AttachedLink[];
  // Where the parent wants this rendered:
  // - "trigger" → "Link" button in the main row's action area. Always
  //   renders (icon-only when links exist) so users can keep adding.
  // - "display" → link chips + edit/clear in the row's expanded sub-row
  //   beneath. Renders nothing when no links exist.
  slot: "trigger" | "display";
};

// Compact display label for a link chip. Prefers the user-supplied label;
// falls back to the host (e.g. "dropbox.com") so the chip stays readable
// even when no label is set.
function displayLabel(link: AttachedLink): string {
  if (link.label) return link.label;
  try {
    const u = new URL(link.url);
    return u.host.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

export function ChecklistLink({ dealId, itemId, links, slot }: ChecklistLinkProps) {
  const [editing, setEditing] = useState<
    { kind: "add" } | { kind: "edit"; link: AttachedLink } | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [, startClear] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const confirm = useConfirm();

  async function handleClear(link: AttachedLink) {
    const ok = await confirm({
      title: "Remove this link?",
      description: `${displayLabel(link)} will be unlinked from this item. The original document at the URL is unaffected.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setPendingDelete(link.id);
    startClear(async () => {
      try {
        await deleteChecklistItemLink({ linkId: link.id, dealId });
      } finally {
        setPendingDelete(null);
      }
    });
  }

  // Trigger slot: always renders the "Link" button. Once at least one
  // link is attached the button collapses to icon-only to stay compact in
  // the action row (matches the docs upload trigger).
  if (slot === "trigger") {
    const hasLinks = links.length > 0;
    return (
      <>
        <button
          type="button"
          onClick={() => setEditing({ kind: "add" })}
          title={hasLinks ? "Add another link" : "Attach a link"}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700"
        >
          <LinkIcon className="h-3 w-3" />
          {hasLinks ? "" : "Link"}
        </button>
        <ChecklistLinkModal
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          dealId={dealId}
          itemId={itemId}
          existing={editing?.kind === "edit" ? editing.link : null}
        />
      </>
    );
  }

  // Display slot: render one chip per link, with overflow.
  if (links.length === 0) return null;
  const overflow = links.length - INLINE_LIMIT;
  const visible = showAll || overflow <= 0 ? links : links.slice(0, INLINE_LIMIT);
  return (
    <>
      {visible.map((link) => (
        <span key={link.id} className="inline-flex items-center gap-0.5">
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
            onClick={() => setEditing({ kind: "edit", link })}
            title="Edit link"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-amber-50 hover:text-amber-700"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => handleClear(link)}
            disabled={pendingDelete === link.id}
            title="Remove link"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {pendingDelete === link.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        </span>
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          title={
            showAll
              ? "Collapse extras"
              : `Show ${overflow} more link${overflow === 1 ? "" : "s"}`
          }
          className="inline-flex items-center gap-1 rounded bg-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-300"
        >
          {showAll ? "Show fewer" : `+${overflow} more`}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")}
          />
        </button>
      )}
      <ChecklistLinkModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        dealId={dealId}
        itemId={itemId}
        existing={editing?.kind === "edit" ? editing.link : null}
      />
    </>
  );
}

type ChecklistLinkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  itemId: string;
  // null = add new; non-null = edit existing.
  existing: AttachedLink | null;
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
        if (existing) {
          await updateChecklistItemLink({ linkId: existing.id, dealId, url, label });
        } else {
          await addChecklistItemLink({ itemId, dealId, url, label });
        }
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
          <DialogTitle>{existing ? "Edit link" : "Attach a link"}</DialogTitle>
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
