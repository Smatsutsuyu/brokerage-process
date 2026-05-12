"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { upload } from "@vercel/blob/client";

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

import { clearDealBanner, setDealBanner } from "./banner-actions";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp";

type BannerUploaderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealName: string;
  hasBanner: boolean;
};

// Per-deal banner image. Used in the Marketing Report PDF header (and any
// future PDFs Chris asks for). When unset, PDFs fall back to the Land
// Advisors-branded default header. Recommended ~1600×600 landscape for
// best PDF rendering — surfaced inline so users know.
export function BannerUploaderModal({
  open,
  onOpenChange,
  dealId,
  dealName,
  hasBanner,
}: BannerUploaderModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startClear] = useTransition();
  const confirm = useConfirm();
  // Cache-buster — preview img re-fetches after a successful upload even
  // though the URL path is the same.
  const [previewKey, setPreviewKey] = useState(0);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`);
      return;
    }
    setIsUploading(true);
    setProgress(0);
    try {
      // Slugged name keeps the blob dashboard browsable. Vercel appends a
      // random suffix automatically so collisions don't matter.
      const ext = file.name.split(".").pop() ?? "jpg";
      const pathname = `deals/${dealId}/banner/banner.${ext}`;
      const result = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/upload/blob",
        clientPayload: JSON.stringify({ dealId, checklistItemId: null }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      await setDealBanner({ dealId, pathname: result.pathname });
      setPreviewKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleClear() {
    const ok = await confirm({
      title: "Remove banner?",
      description:
        "PDFs generated for this deal will fall back to the default Land Advisors header. You can upload a new banner anytime.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    startClear(async () => {
      try {
        await clearDealBanner(dealId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove banner");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isUploading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Banner image</DialogTitle>
          <DialogDescription>
            Used in the header of the Marketing Report PDF (and other
            generated PDFs) for {dealName}. JPEG / PNG / WebP, max 5 MB.
            Landscape orientation works best — roughly 1600×600 pixels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex aspect-[16/6] items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50">
            {hasBanner ? (
              // Preview from the streaming endpoint. previewKey forces a
              // re-fetch after a fresh upload (URL path doesn't change).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/deals/${dealId}/banner?v=${previewKey}`}
                alt="Current banner"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs">No banner set — PDFs use default header</span>
              </div>
            )}
          </div>

          {isUploading && (
            <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
              Uploading{progress !== null ? ` ${progress}%` : "…"}
            </div>
          )}
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>

        <DialogFooter>
          {hasBanner && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={isUploading}
              className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove banner
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Done
          </Button>
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="h-3.5 w-3.5" />
            {hasBanner ? "Replace" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
