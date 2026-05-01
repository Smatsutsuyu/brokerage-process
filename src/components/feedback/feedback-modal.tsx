"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

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

import { submitFeedback } from "./actions";
import { useFeedback } from "./feedback-context";

const SHORT_SHA_LEN = 7;

type Severity = "nit" | "suggestion" | "bug" | "blocker";

type FeedbackModalProps = {
  commitSha: string;
};

export function FeedbackModal({ commitSha }: FeedbackModalProps) {
  const { isOpen, section, close } = useFeedback();
  const pathname = usePathname();

  const [comment, setComment] = useState("");
  const [severity, setSeverity] = useState<Severity>("suggestion");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset form whenever the modal closes.
  useEffect(() => {
    if (!isOpen) {
      // Slight delay so the close animation doesn't show empty state mid-transition.
      const t = setTimeout(() => {
        setComment("");
        setSeverity("suggestion");
        setError(null);
        setSubmitted(false);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!comment.trim()) {
      setError("Please add a comment.");
      return;
    }
    startTransition(async () => {
      try {
        await submitFeedback({
          section,
          pagePath: pathname,
          commitSha,
          severity,
          comment,
        });
        setSubmitted(true);
        setTimeout(close, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit feedback.");
      }
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Goes straight to Sean. Captures the section, page, and current build so it&rsquo;s easy
            to act on.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">✓</div>
            <p className="text-sm font-medium text-gray-900">Thanks — got it.</p>
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
                onValueChange={(v) => setSeverity(v as Severity)}
              >
                <SelectTrigger id="feedback-severity">
                  <SelectValue />
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
