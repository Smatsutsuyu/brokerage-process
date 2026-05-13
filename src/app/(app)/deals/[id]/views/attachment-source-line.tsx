"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

type AttachmentSourceLineProps = {
  // The button (or any element) the line originates from. Typically the
  // hovered "Send" button on a checklist row.
  fromRef: RefObject<HTMLElement | null>;
  // DOM id of the source item (the row whose attachment is being
  // referenced). When not in the DOM (collapsed phase, hidden tab) the
  // overlay just doesn't render — caller's other affordances still work.
  toElementId: string;
};

type Coords = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

// Faint amber Bezier curve drawn from `fromRef` to the element with
// `toElementId`. Uses a portal into document.body + a fixed-position SVG
// so the curve sits above any scrollable container without parent stacking
// surprises. Re-measures on scroll/resize so it tracks live as the page
// reflows.
//
// Pointer-events stay off so the line never intercepts clicks/hover —
// purely decorative.
export function AttachmentSourceLine({ fromRef, toElementId }: AttachmentSourceLineProps) {
  const [coords, setCoords] = useState<Coords | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const fromEl = fromRef.current;
      const toEl = document.getElementById(toElementId);
      if (!fromEl || !toEl) {
        setCoords(null);
        return;
      }
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      // Source row is collapsed/zero-sized — skip drawing.
      if (toRect.width === 0 && toRect.height === 0) {
        setCoords(null);
        return;
      }
      setCoords({
        // Anchor at the left edge of the button so the curve sweeps out
        // and back rather than overlapping the button's own background.
        fromX: fromRect.left,
        fromY: fromRect.top + fromRect.height / 2,
        // Anchor at the right edge of the source row so the line lands
        // on its action area (where attachments live) rather than on
        // empty whitespace at the row's left edge.
        toX: toRect.right - 8,
        toY: toRect.top + toRect.height / 2,
      });
    }
    measure();
    // Capture-phase scroll so we catch scrolls in any nested container,
    // not just window scroll. Same with resize.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [fromRef, toElementId]);

  // Highlight the source row while the connector is alive. Side effect on
  // the DOM rather than component state because the source row lives in a
  // different React subtree (different PhaseSection instance).
  useEffect(() => {
    const target = document.getElementById(toElementId);
    if (!target) return;
    target.classList.add(
      "ring-2",
      "ring-amber-300",
      "ring-offset-2",
      "ring-offset-white",
      "rounded-sm",
    );
    return () => {
      target.classList.remove(
        "ring-2",
        "ring-amber-300",
        "ring-offset-2",
        "ring-offset-white",
        "rounded-sm",
      );
    };
  }, [toElementId]);

  if (!coords) return null;

  // Cubic Bezier with control points pulled outward to give the curve a
  // gentle S-shape rather than a straight diagonal. Distance-aware so
  // close pairs don't get over-curved.
  const dx = coords.toX - coords.fromX;
  const dy = coords.toY - coords.fromY;
  const dist = Math.hypot(dx, dy);
  const bowOut = Math.min(120, Math.max(40, dist * 0.3));
  const c1x = coords.fromX - bowOut;
  const c1y = coords.fromY;
  const c2x = coords.toX + bowOut;
  const c2y = coords.toY;
  const path = `M ${coords.fromX},${coords.fromY} C ${c1x},${c1y} ${c2x},${c2y} ${coords.toX},${coords.toY}`;

  return createPortal(
    <svg
      className="pointer-events-none fixed inset-0 z-50 h-full w-full animate-in fade-in duration-200"
      // viewBox matches the viewport so coordinates from getBoundingClientRect map 1:1.
      // No need to set width/height numerically — Tailwind sizes the SVG and the
      // browser uses CSS pixels for the path coordinates.
    >
      <defs>
        <marker
          id="om-blast-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(217 119 6 / 0.7)" />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="rgb(217 119 6 / 0.55)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        markerEnd="url(#om-blast-arrow)"
      />
    </svg>,
    document.body,
  );
}
