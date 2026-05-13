"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { upload } from "@vercel/blob/client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { recordFeedbackAttachment, submitFeedback } from "./actions";
import { useFeedback } from "./feedback-context";

const SHORT_SHA_LEN = 7;
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024;

type Severity = "nit" | "suggestion" | "bug" | "blocker";

const SEVERITY_LABEL: Record<Severity, string> = {
  nit: "Nit",
  suggestion: "Suggestion",
  bug: "Bug",
  blocker: "Blocker",
};

type FeedbackModalProps = {
  commitSha: string;
};

export function FeedbackModal({ commitSha }: FeedbackModalProps) {
  const { isOpen, section, close } = useFeedback();
  const pathname = usePathname();

  const [comment, setComment] = useState("");
  const [severity, setSeverity] = useState<Severity>("suggestion");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Tracks the current upload-in-progress filename for the spinner label
  // ("Uploading 2 of 3: example.pdf").
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever the modal closes.
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => {
        setComment("");
        setSeverity("suggestion");
        setFiles([]);
        setError(null);
        setSubmitted(false);
        setUploadProgress(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const next: File[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_BYTES_PER_FILE) {
        setError(`${f.name}: too large (max 10 MB).`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!comment.trim()) {
      setError("Please add a comment.");
      return;
    }
    startTransition(async () => {
      try {
        // Phase 1: create the feedback row, get its id.
        const { feedbackId } = await submitFeedback({
          section,
          pagePath: pathname,
          commitSha,
          severity,
          comment,
        });

        // Phase 2: upload each file directly to Vercel Blob, then record
        // the attachment row server-side. Sequential rather than parallel
        // so the progress label tracks accurately and we don't open N
        // simultaneous network requests on a slow connection.
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setUploadProgress({ current: i + 1, total: files.length, name: f.name });
          const slug = f.name
            .toLowerCase()
            .replace(/[^a-z0-9.]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80);
          const pathnameForBlob = `feedback/${feedbackId}/${slug || "file"}`;
          const result = await upload(pathnameForBlob, f, {
            access: "private",
            handleUploadUrl: "/api/upload/blob",
            clientPayload: JSON.stringify({
              kind: "feedback-attachment",
              feedbackId,
            }),
          });
          await recordFeedbackAttachment({
            feedbackId,
            pathname: result.pathname,
            name: f.name,
          });
        }
        setUploadProgress(null);

        setSubmitted(true);
        setTimeout(close, 1200);
      } catch (err) {
        setUploadProgress(null);
        setError(err instanceof Error ? err.message : "Could not submit feedback.");
      }
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isPending) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Captures the section, page, and current build alongside your note so it&rsquo;s easy to
            act on. You can attach example files (mockups, PDFs, screenshots).
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">✓</div>
            <p className="text-sm font-medium text-gray-900">Your feedback has been recorded.</p>
            <p className="mt-1 text-xs text-gray-500">Thanks for taking the time.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <div>
                <span className="font-medium text-gray-700">Section:</span> {section}
              </div>
              <div>
                <span className="font-medium text-gray-700">Page:</span>{" "}
                <code className="text-[11px]">{pathname}</code>
              </div>
              <div>
                <span className="font-medium text-gray-700">Build:</span>{" "}
                <code className="text-[11px]">{commitSha.slice(0, SHORT_SHA_LEN)}</code>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feedback-severity">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => v && setSeverity(v as Severity)}
              >
                <SelectTrigger id="feedback-severity">
                  <SelectValue>{SEVERITY_LABEL[severity]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nit">Nit</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="blocker">Blocker</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feedback-comment">Comment</Label>
              <Textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you notice? What would you change?"
                rows={5}
                autoFocus
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>Attachments (optional)</Label>
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px]"
                  >
                    <Paperclip className="h-3 w-3 flex-shrink-0 text-gray-400" />
                    <span className="flex-1 truncate text-gray-700">{f.name}</span>
                    <span className="text-[10px] tabular-nums text-gray-400">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={isPending}
                      title="Remove"
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
                >
                  <Paperclip className="h-3 w-3" />
                  {files.length === 0 ? "Attach files" : "Attach more"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  onChange={(e) => addFiles(e.target.files)}
                />
                <p className="text-[10px] text-gray-500">
                  PDF / images / docs · 10 MB per file max.
                </p>
              </div>
            </div>

            {uploadProgress && (
              <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />
                Uploading {uploadProgress.current} of {uploadProgress.total}:{" "}
                <code className="text-[10px]">{uploadProgress.name}</code>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Send feedback
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
