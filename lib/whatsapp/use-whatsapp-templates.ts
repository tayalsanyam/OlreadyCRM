"use client";

import { useCallback, useEffect, useState } from "react";
import {
  resolveWhatsAppConfig,
  type ResolvedWhatsAppConfig,
} from "./config";

const FALLBACK = resolveWhatsAppConfig(null);

export function useWhatsAppTemplates(refreshKey = 0) {
  const [state, setState] = useState<ResolvedWhatsAppConfig & { loading: boolean }>({
    ...FALLBACK,
    loading: true,
  });

  const refetch = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((json: { data?: ResolvedWhatsAppConfig; error?: string }) => {
        if (json.data) setState({ ...json.data, loading: false });
        else setState({ ...FALLBACK, loading: false });
      })
      .catch(() => setState({ ...FALLBACK, loading: false }));
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((json: { data?: ResolvedWhatsAppConfig; error?: string }) => {
        if (!mounted) return;
        if (json.data) setState({ ...json.data, loading: false });
        else setState({ ...FALLBACK, loading: false });
      })
      .catch(() => {
        if (mounted) setState({ ...FALLBACK, loading: false });
      });
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  return { ...state, refetch };
}
