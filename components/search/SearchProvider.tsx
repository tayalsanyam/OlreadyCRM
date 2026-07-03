"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import type { SessionUser } from "@/lib/types";

export const OPEN_SEARCH_EVENT = "olready-open-search";

interface SearchProviderProps {
  user: SessionUser;
}

export function SearchProvider({ user }: SearchProviderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <CommandPalette open={open} onClose={() => setOpen(false)} user={user} />
  );
}
