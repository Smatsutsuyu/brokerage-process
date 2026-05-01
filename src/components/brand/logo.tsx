import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  variant?: "full" | "icon";
};

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
    <div className={cn("flex items-center gap-3", className)}>
      <div className="bg-brand-ink flex h-9 w-9 items-center justify-center rounded">
        <LayeredMountainIcon className="h-5 w-5 text-white" />
      </div>
      <div className="leading-tight">
        <div className="text-base font-bold tracking-wide">Land Advisors</div>
        <div className="text-muted-foreground text-[9px] font-semibold tracking-[0.2em] uppercase">
          Organization
        </div>
      </div>
    </div>
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
