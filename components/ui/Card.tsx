import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  const styles = cn(
    "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
    onClick && "cursor-pointer hover:border-accent/40 transition-colors",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn("w-full text-left", styles)}>
        {children}
      </button>
    );
  }

  return <div className={styles}>{children}</div>;
}
