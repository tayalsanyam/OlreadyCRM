"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { syncCallyzerCalls } from "@/lib/callyzer-sync-client";
import { formatDate } from "@/lib/utils";

type SyncStatus = {
  callyzerNumber: string | null;
  lastSyncedAt: string | null;
  valid?: boolean;
  message?: string;
};

interface CallyzerSyncButtonProps {
  statusUrl: string;
  syncUrl: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}

export function CallyzerSyncButton({
  statusUrl,
  syncUrl,
  label = "Refresh Callyzer calls",
  size = "sm",
  variant = "secondary",
  className,
}: CallyzerSyncButtonProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(statusUrl, { cache: "no-store" });
      const json = (await res.json()) as { data: SyncStatus | null };
      setStatus(json.data);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [statusUrl]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleSync() {
    setLoading(true);
    try {
      const result = await syncCallyzerCalls({
        syncUrl,
        extended: true,
      });
      const detail =
        result.message ??
        `${result.inserted} new · ${result.skipped} skipped · ${result.synced} fetched`;
      toast(`Callyzer sync done — ${detail}`);
      await loadStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Callyzer sync failed";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  if (statusLoading) {
    return <p className="text-xs text-slate-muted">Loading Callyzer status…</p>;
  }

  if (!status?.valid) {
    return (
      <p className="text-xs text-amber-700">
        {status?.message ?? "No Callyzer number on this profile — add a 10-digit mobile to sync calls."}
      </p>
    );
  }

  return (
    <div className={className}>
      <p className="mb-1 text-xs text-slate-muted">
        Callyzer: {status.callyzerNumber}
        {status.lastSyncedAt && (
          <>
            {" "}
            · Last sync{" "}
            {formatDate(status.lastSyncedAt.slice(0, 10))}{" "}
            {new Date(status.lastSyncedAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </>
        )}
        {!status.lastSyncedAt && " · Not synced yet today"}
      </p>
      <Button
        size={size}
        variant={variant}
        disabled={loading}
        onClick={() => void handleSync()}
      >
        {loading ? "Syncing…" : label}
      </Button>
    </div>
  );
}
