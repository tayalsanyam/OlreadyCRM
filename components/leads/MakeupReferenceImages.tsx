"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { MakeupReferenceImage } from "@/lib/makeup-reference-images";

export function MakeupReferenceImages({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<MakeupReferenceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/makeup-look/references`);
      const json = (await res.json()) as { data?: MakeupReferenceImage[] | null };
      setImages(json.data ?? []);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPick(file: File | null) {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/leads/${leadId}/makeup-look/references`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as { data?: MakeupReferenceImage | null; error?: string };
    setUploading(false);
    if (!res.ok) {
      toast(json.error ?? "Upload failed", "error");
      return;
    }
    if (json.data) setImages((prev) => [...prev, json.data!]);
    toast("Reference image uploaded");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(imageId: string) {
    const res = await fetch(
      `/api/leads/${leadId}/makeup-look/references?imageId=${encodeURIComponent(imageId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Could not remove image", "error");
      return;
    }
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    toast("Image removed");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text">Reference images</p>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload image"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-muted">Loading images…</p>
      ) : images.length === 0 ? (
        <p className="text-xs text-slate-muted">
          Upload inspiration photos the bride shared (Pinterest, celebrity looks, etc.).
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.filePath}
                alt={img.fileName}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => void remove(img.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
