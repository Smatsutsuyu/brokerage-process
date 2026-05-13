"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { upload } from "@vercel/blob/client";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { cn } from "@/lib/utils";

import { deleteDocument, recordUpload } from "../document-actions";

export type AttachedDocument = {
  id: string;
  name: string;
  version: number;
  mimeType: string | null;
  uploadedAt: string;
};

// How many doc chips to render inline before overflowing into a "+N more"
// expand button. Picked low so common cases (1-3 files) display naturally
// without crowding the row; 4+ files collapse the tail into a single chip
// the user can click to reveal.
const INLINE_LIMIT = 3;

type ChecklistDocumentProps = {
  dealId: string;
  checklistItemId: string;
  // All documents attached to this checklist item, newest first. Empty
  // array when nothing has been uploaded yet.
  documents: AttachedDocument[];
  // Display name for the checklist item — used to derive a sensible blob
  // pathname so docs are at least roughly browsable in Vercel Blob's UI.
  itemName: string;
  // Where the parent wants this rendered:
  // - "trigger" → the Upload button in the main row's action area.
  //   Always renders so users can keep adding files even when others are
  //   already attached.
  // - "display" → the doc chip(s) + remove icons in the row's expanded
  //   sub-row beneath. Renders nothing when no docs exist.
  slot: "trigger" | "display";
};

export function ChecklistDocument({
  dealId,
  checklistItemId,
  documents,
  itemName,
  slot,
}: ChecklistDocumentProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const confirm = useConfirm();

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    setProgress(0);
    try {
      const slug = itemName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      const pathname = `deals/${dealId}/${slug || "document"}/${file.name}`;
      const result = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/upload/blob",
        clientPayload: JSON.stringify({ kind: "document", dealId, checklistItemId }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      await recordUpload({
        dealId,
        checklistItemId,
        pathname: result.pathname,
        name: file.name,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(doc: AttachedDocument) {
    const ok = await confirm({
      title: "Remove this document?",
      description: `${doc.name} will be deleted from storage. This can't be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setPendingDelete(doc.id);
    startDelete(async () => {
      try {
        await deleteDocument(doc.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setPendingDelete(null);
      }
    });
  }

  // Hidden file input shared by every "Upload" affordance.
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handleFile(f);
      }}
    />
  );

  // Trigger slot: always renders the upload button (so users can stack
  // additional files even when some are already attached). Upload-in-
  // progress label replaces the button while a file is in flight.
  if (slot === "trigger") {
    if (isUploading) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Uploading{progress !== null ? ` ${progress}%` : "…"}
        </span>
      );
    }
    // Once at least one doc is attached the icon-only "+ another" button
    // sits compact in the action row — full Upload label only when zero
    // docs exist (signals the affordance more clearly to first-time use).
    const hasDocs = documents.length > 0;
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={hasDocs ? "Add another file" : "Upload a file"}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700",
          )}
        >
          <Upload className="h-3 w-3" />
          {hasDocs ? "" : "Upload"}
        </button>
        {fileInput}
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </span>
    );
  }

  // Display slot: render one chip per attached document. Beyond
  // INLINE_LIMIT, collapse the tail into a "+N more" pill that toggles
  // the rest open/closed inline (no popover). Sub-row layout already
  // wraps so a long expanded list flows naturally.
  if (documents.length === 0) return null;
  const overflow = documents.length - INLINE_LIMIT;
  const visible = showAll || overflow <= 0 ? documents : documents.slice(0, INLINE_LIMIT);
  return (
    <>
      {visible.map((doc) => (
        <span key={doc.id} className="inline-flex items-center gap-0.5">
          <a
            href={`/api/documents/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${doc.name} (v${doc.version})`}
            className="hover:bg-brand-blue/10 hover:text-brand-blue inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors"
          >
            <FileText className="h-3 w-3" />
            <span className="max-w-[240px] truncate">{doc.name}</span>
            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
          </a>
          <button
            type="button"
            onClick={() => handleDelete(doc)}
            disabled={pendingDelete === doc.id}
            title="Delete document"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {pendingDelete === doc.id ? (
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
          title={showAll ? "Collapse extras" : `Show ${overflow} more file${overflow === 1 ? "" : "s"}`}
          className="inline-flex items-center gap-1 rounded bg-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-300"
        >
          {showAll ? "Show fewer" : `+${overflow} more`}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")}
          />
        </button>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </>
  );
}
