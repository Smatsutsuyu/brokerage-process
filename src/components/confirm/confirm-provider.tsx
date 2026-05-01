"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      // If a previous confirm is still resolving, treat it as cancelled —
      // last call wins. Edge case; protects against stuck promises.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOpts(options);
      setOpen(true);
    });
  }, []);

  function close(value: boolean) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
    // Keep options in state long enough for the close animation; clearing
    // immediately would blank the dialog body mid-fade.
    setTimeout(() => setOpts(null), 200);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{opts?.title ?? ""}</DialogTitle>
            {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => close(true)}
              className={cn(
                opts?.variant === "destructive" && "bg-red-600 text-white hover:bg-red-700",
              )}
            >
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
