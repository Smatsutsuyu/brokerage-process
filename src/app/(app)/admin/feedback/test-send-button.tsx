"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

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

import { sendFeedbackSummary } from "./actions";

type TestSendButtonProps = {
  // Default recipient prefill — set to the signed-in user's own email so
  // the modal opens with a sensible default. Editable for one-off sends
  // to teammates / clients.
  defaultRecipient: string;
};

export function TestSendButton({ defaultRecipient }: TestSendButtonProps) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await sendFeedbackSummary({ recipient: recipient.trim() });
      if (result.ok) {
        toast.success(
          result.itemCount === 0
            ? "Sent — no open items in the summary"
            : `Sent — ${result.itemCount} open item${result.itemCount === 1 ? "" : "s"} included`,
        );
        setOpen(false);
      } else {
        const detail =
          result.reason === "disabled"
            ? "Email disabled (RESEND_API_KEY not set)"
            : result.reason === "config"
              ? `Configuration error: ${result.error ?? "missing setting"}`
              : `Send failed: ${result.error ?? "unknown error"}`;
        toast.error(detail);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" />
        Send summary
      </Button>
      <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send open-items summary</DialogTitle>
            <DialogDescription>
              Sends a single email with every non-terminal feedback item (new + reviewed +
              actioned), grouped by status. Useful as a status snapshot or to verify the email
              pipeline is wired up.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="recipient">Recipient</Label>
              <Input
                id="recipient"
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                required
              />
              <p className="text-[11px] text-gray-500">
                Defaults to your own address. Change for one-off sends.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !recipient.trim()}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
