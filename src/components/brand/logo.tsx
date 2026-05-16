import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  variant?: "full" | "icon";
};

// The full LAO logo (mountain icon + "Land Advisors / Organization"
// wordmark) lives in public/ as a single image so it renders identically
// in the sidebar, sign-in page, and anywhere else we surface it. Native
// aspect ratio is roughly 3.6:1; we lock the height and let width auto.
//
// The "icon" variant falls back to a simple layered-mountain SVG since we
// don't currently have a square mark of the LAO logo. Used in compact
// contexts (collapsed nav, small chips) where the full wordmark wouldn't
// read at the available size.
export function LandAdvisorsLogo({ className, variant = "full" }: LogoProps) {
  if (variant === "icon") {
    return (
      <div
        className={cn(
          "bg-brand-ink flex h-9 w-9 items-center justify-center rounded",
          className,
        )}
      >
        <LayeredMountainIcon className="h-5 w-5 text-white" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/lao-logo.jpg"
      alt="Land Advisors Organization"
      className={cn("h-9 w-auto", className)}
    />
  );
}

function LayeredMountainIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
