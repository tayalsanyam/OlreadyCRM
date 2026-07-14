"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function SlideOver({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const panelClass = cn(
    "absolute right-0 top-0 flex h-full flex-col bg-white shadow-2xl",
    wide ? "w-full max-w-[50vw] min-w-[720px]" : "w-full max-w-md"
  );

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div role="dialog" aria-modal className={panelClass}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-brand">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              ✕
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
