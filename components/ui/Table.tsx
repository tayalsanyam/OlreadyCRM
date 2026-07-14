import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-slate-200 bg-white", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-100 bg-light-bg text-left text-xs font-semibold uppercase tracking-wide text-slate-muted">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TR({ children, className, ...props }: ComponentProps<"tr">) {
  return (
    <tr className={cn("hover:bg-slate-50/80", className)} {...props}>
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3", className)}>{children}</th>;
}

export function TD({
  children,
  className,
  colSpan,
  title,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td colSpan={colSpan} title={title} className={cn("px-4 py-3", className)}>
      {children}
    </td>
  );
}
