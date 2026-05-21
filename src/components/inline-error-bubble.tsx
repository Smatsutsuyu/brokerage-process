"use client";

// Reusable "rejection bubble" anchored next to an action button.
//
// Use this — instead of a corner toast (sonner) — whenever a button's
// click is rejected by client-side validation and the user needs to see
// WHICH button failed. Sonner toasts stack in a fixed corner and don't
// tell the user which row triggered them, which is confusing when the
// page has many lookalike "Send …" buttons.
//
// Standard usage pattern:
//
//   const { error, show, clear, bubble } = useInlineError();
//
//   function handleClick() {
//     if (!canProceed) {
//       show("Upload a file first, then send.");
//       return;
//     }
//     // proceed…
//   }
//
//   return (
//     <span className="relative inline-block">
//       <button
//         onClick={handleClick}
//         className={cn(baseStyles, error && "ring-1 ring-red-300")}
//       >
//         …
//       </button>
//       {bubble}
//     </span>
//   );
//
// Convention for buttons that send a file and/or link in an email:
//   - File required (recipient needs the document attached, e.g. Market
//     Study) → validate file count > 0; reject with a message naming
//     the noun ("No Market Study attached. Upload it first.")
//   - Link OR file acceptable (DD folder share where a Dropbox link is
//     normal) → validate file + link count > 0; reject with a message
//     naming the noun ("No DD folder link or file attached.")
//   - Always inline-bubble, never sonner toast, for these row-button
//     rejections. Network/server errors still go through sonner since
//     they aren't tied to row data state.
//
// Positioning:
//   - Centered horizontally on the trigger button (`left-1/2` plus a
//     translate-X of -50% as the baseline).
//   - Sized to its content's natural single-line width (`w-max`) up to
//     a 320px cap, so the bubble doesn't shrink-to-fit inside the
//     narrow button's containing block and wrap every other word.
//   - Auto-clamped to the viewport: after layout, the bubble measures
//     its `getBoundingClientRect()` and applies an extra translate-X
//     shift if either edge would be outside the viewport. Runs in a
//     useLayoutEffect (pre-paint) so there's no flicker; bubble is
//     `visibility: hidden` until measured.
//   - Default placement is below the button; pass `placement="above"`
//     for rows near the bottom of the page where below would clip.
//
// Reuse `useInlineError()` to get the state + bubble together. Use
// `<InlineErrorBubble />` directly when you need to manage the message
// state yourself (e.g. driven by a parent component).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type InlineErrorBubbleProps = {
  message: string | null;
  onDismiss: () => void;
  // Optional positional override. Default: drops below the button.
  // "above" floats above the button for rows near the bottom of the page.
  placement?: "below" | "above";
};

// Padding from the viewport edge we keep when clamping the bubble in.
const VIEWPORT_PAD_PX = 8;

export function InlineErrorBubble({
  message,
  onDismiss,
  placement = "below",
}: InlineErrorBubbleProps) {
  const bubbleRef = useRef<HTMLButtonElement | null>(null);
  // Horizontal shift applied on top of the centered baseline so the
  // bubble doesn't run off the viewport when the trigger is near a
  // screen edge. Measured after layout; 0 in the common case.
  const [shiftPx, setShiftPx] = useState(0);
  const [measured, setMeasured] = useState(false);

  // Re-measure each time a new message appears. useLayoutEffect runs
  // before paint so the shift applies in the same frame the bubble
  // becomes visible — no flicker. Hidden via visibility (not display)
  // so getBoundingClientRect still returns real numbers.
  useLayoutEffect(() => {
    if (!message) {
      setMeasured(false);
      setShiftPx(0);
      return;
    }
    const el = bubbleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let shift = 0;
    if (rect.left < VIEWPORT_PAD_PX) {
      shift = VIEWPORT_PAD_PX - rect.left;
    } else if (rect.right > window.innerWidth - VIEWPORT_PAD_PX) {
      shift = window.innerWidth - VIEWPORT_PAD_PX - rect.right;
    }
    setShiftPx(shift);
    setMeasured(true);
  }, [message]);

  if (!message) return null;
  return (
    <button
      ref={bubbleRef}
      type="button"
      onClick={onDismiss}
      role="alert"
      // Center horizontally on the trigger via `left-1/2` + a -50%
      // translate; the inline `transform` style adds the viewport-clamp
      // shift on top. w-max lets the bubble size to its content's
      // preferred (single-line) width regardless of the containing
      // button's width — without it the absolutely-positioned element
      // shrink-to-fits inside the narrow parent and wraps every other
      // word. max-w caps the bubble for messages long enough to actually
      // need wrapping.
      style={{
        transform: `translateX(calc(-50% + ${shiftPx}px))`,
        visibility: measured ? "visible" : "hidden",
      }}
      className={`absolute left-1/2 z-20 inline-flex w-max max-w-[320px] items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-left text-[11px] leading-snug font-medium text-red-900 shadow-md hover:bg-red-100 ${
        placement === "below" ? "top-full mt-1" : "bottom-full mb-1"
      }`}
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-red-700" />
      <span className="flex-1">{message}</span>
      <X className="mt-px h-3 w-3 flex-shrink-0 text-red-500" />
    </button>
  );
}

type UseInlineErrorOptions = {
  // How long the bubble stays before auto-dismissing. Default 6s.
  durationMs?: number;
  placement?: "below" | "above";
};

// Hook variant. Returns the message + helpers AND a pre-built bubble
// node so callers can just spread it next to the button.
export function useInlineError(opts: UseInlineErrorOptions = {}) {
  const { durationMs = 6000, placement } = opts;
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setError(null);
  }, []);

  const show = useCallback(
    (msg: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setError(msg);
      timerRef.current = setTimeout(() => setError(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const bubble = (
    <InlineErrorBubble message={error} onDismiss={clear} placement={placement} />
  );

  return { error, show, clear, bubble };
}
