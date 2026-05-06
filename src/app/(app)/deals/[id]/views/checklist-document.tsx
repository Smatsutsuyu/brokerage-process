"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
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

type ChecklistDocumentProps = {
  dealId: string;
  checklistItemId: string;
  // The current latest-version doc attached to this checklist item, or null
  // when nothing has been uploaded yet.
  document: AttachedDocument | null;
  // Display name for the checklist item — used to derive a sensible blob
  // pathname so docs are at least roughly browsable in Vercel Blob's UI.
  itemName: string;
};

export function ChecklistDocument({
  dealId,
  checklistItemId,
  document,
  itemName,
}: ChecklistDocumentProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    setProgress(0);
    try {
      // Build a roughly-readable blob pathname so the file is identifiable
      // in Vercel Blob's dashboard. Vercel will append a random suffix for
      // uniqueness so two files with the same name don't collide.
      const slug = itemName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      const pathname = `deals/${dealId}/${slug || "document"}/${file.name}`;

      const result = await upload(pathname, file, {
        // Private store — the URL returned isn't directly fetchable; downloads
        // route through /api/documents/[id] which streams via the SDK using
        // BLOB_READ_WRITE_TOKEN. Set in the Vercel dashboard when the store
        // was provisioned.
        access: "private",
        handleUploadUrl: "/api/upload/blob",
        clientPayload: JSON.stringify({ dealId, checklistItemId }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      // Webhook-style onUploadCompleted doesn't fire on localhost (Vercel
      // can't reach our dev box). Call our server action directly with the
      // pathname — server verifies it via head() before writing the row.
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

  async function handleDelete() {
    if (!document) return;
    const ok = await confirm({
      title: "Remove this document?",
      description: `${document.name} will be deleted from storage. This can't be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      try {
        await deleteDocument(document.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  // Hidden file input shared by both states (no-doc → upload; has-doc → replace).
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

  if (isUploading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Uploading{progress !== null ? ` ${progress}%` : "…"}
      </span>
    );
  }

  if (document) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <a
          href={`/api/documents/${document.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`${document.name} (v${document.version})`}
          className="hover:bg-brand-blue/10 hover:text-brand-blue inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors"
        >
          <FileText className="h-3 w-3" />
          <span className="max-w-[160px] truncate">{document.name}</span>
          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
        </a>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Replace with a new version"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-amber-50 hover:text-amber-700"
        >
          <Upload className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title="Delete document"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        {fileInput}
        {error && <span className="ml-1 text-[10px] text-red-600">{error}</span>}
      </span>
    );
  }

  // No document yet — compact upload button.
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-amber-50 hover:text-amber-700",
        )}
      >
        <Upload className="h-3 w-3" />
        Upload
      </button>
      {fileInput}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
