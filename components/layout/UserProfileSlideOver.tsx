"use client";

import Link from "next/link";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { CallyzerSyncButton } from "@/components/callyzer/CallyzerSyncButton";
import { isDayEndRequiredRole } from "@/lib/day-end";
import type { SessionUser } from "@/lib/types";

const ROLE_LABELS: Record<SessionUser["role"], string> = {
  regionalRm: "Regional RM",
  commissionRm: "Commission RM",
  leadUploader: "Lead Uploader",
  feedbackRm: "Feedback",
  careAgent: "Care Agent",
  salesRm: "Sales RM",
  salesTl: "Sales TL",
  salesActivation: "Sales Activation",
  admin: "Admin",
  owner: "Owner",
};

interface UserProfileSlideOverProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
}

export function UserProfileSlideOver({ open, onClose, user }: UserProfileSlideOverProps) {
  const showDayEnd = isDayEndRequiredRole(user.role);

  return (
    <SlideOver open={open} onClose={onClose} title="My profile">
      <div className="space-y-6 text-sm">
        <div>
          <p className="text-lg font-semibold text-text">{user.name}</p>
          <p className="text-slate-muted">{ROLE_LABELS[user.role]}</p>
          {user.regions?.length ? (
            <p className="mt-1 capitalize text-slate-muted">Regions: {user.regions.join(", ")}</p>
          ) : user.region ? (
            <p className="mt-1 capitalize text-slate-muted">Region: {user.region}</p>
          ) : null}
        </div>

        {showDayEnd && (
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 font-medium text-text">Day end checkout</p>
            <p className="mb-3 text-xs text-slate-muted">
              Submit your daily report. Opening the tab refreshes Callyzer first.
            </p>
            <Link href="/day-end" onClick={onClose}>
              <Button type="button" variant="secondary" size="sm">
                Open Day End Report
              </Button>
            </Link>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-3 font-medium text-text">Call sync</p>
          <p className="mb-3 text-xs text-slate-muted">
            Pulls your Callyzer calls since your last sync (or start of today IST). Runs automatically
            when you log in; use refresh if you need to pull again.
          </p>
          <CallyzerSyncButton
            statusUrl="/api/me/callyzer-sync"
            syncUrl="/api/me/callyzer-sync"
          />
        </div>
      </div>
    </SlideOver>
  );
}
