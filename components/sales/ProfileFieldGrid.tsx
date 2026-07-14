"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function profileInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ProfileAvatar({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-base";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-white",
        sizeClass,
        className
      )}
      aria-hidden
    >
      {profileInitials(name)}
    </div>
  );
}

export function ProfileSection({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ProfileCollapsibleSection({
  title,
  children,
  defaultOpen = true,
  badge,
  className,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
          {badge}
        </span>
        <span className="text-sm text-slate-400" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="border-t border-slate-100 px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  );
}

export function ProfileField({
  label,
  value,
  className,
  href,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  href?: string;
}) {
  const empty = value == null || value === "" || value === false;
  const content = empty ? "—" : value;
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      {href && !empty ? (
        <a
          href={href}
          className="mt-0.5 block text-sm text-accent hover:underline"
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
        >
          {content}
        </a>
      ) : (
        <p className={cn("mt-0.5 text-sm text-slate-800", empty && "text-slate-400")}>{content}</p>
      )}
    </div>
  );
}

export function ProfileFieldGrid({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const colClass =
    cols === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";
  return <dl className={cn("grid gap-3", colClass)}>{children}</dl>;
}

export function ProfileStatCard({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-3",
        alert ? "border-amber-200 bg-amber-50/50" : "border-slate-200"
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 font-semibold text-brand", typeof value === "string" && value.length > 8 ? "text-lg" : "text-2xl")}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-muted">{hint}</p> : null}
    </div>
  );
}

export function ProfileContactLinks({
  phone,
  whatsapp,
  instagram,
  email,
}: {
  phone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  email?: string | null;
}) {
  const waDigits = (whatsapp || phone || "").replace(/\D/g, "");
  const waHref = waDigits.length >= 10 ? `https://wa.me/91${waDigits.slice(-10)}` : null;
  const igHandle = instagram?.trim().replace(/^@/, "");
  const igHref = igHandle
    ? igHandle.startsWith("http")
      ? igHandle
      : `https://instagram.com/${igHandle}`
    : null;
  const emailTrimmed = email?.trim() || null;
  const mailHref = emailTrimmed ? `mailto:${emailTrimmed}` : null;

  if (!phone && !waHref && !igHref && !mailHref) {
    return <p className="text-xs text-slate-muted">No contact links on file</p>;
  }

  const chip =
    "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-accent hover:text-accent";

  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className={chip}>
          Call · {phone}
        </a>
      ) : null}
      {waHref ? (
        <a href={waHref} target="_blank" rel="noreferrer" className={cn(chip, "border-emerald-200 text-emerald-800 hover:border-emerald-400 hover:text-emerald-900")}>
          WhatsApp
        </a>
      ) : null}
      {igHref ? (
        <a href={igHref} target="_blank" rel="noreferrer" className={chip}>
          Instagram
        </a>
      ) : null}
      {mailHref ? (
        <a href={mailHref} className={chip}>
          Email · {emailTrimmed}
        </a>
      ) : null}
    </div>
  );
}

export function ProfileEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
      <p className="text-sm text-slate-muted">{message}</p>
    </div>
  );
}
