"use client";

import { useState } from "react";
import { useId } from "react";
import { SERVER_URL } from "@/lib/config";
import AlertBanner from "@/components/AlertBanner";
import PrimaryButton from "@/components/PrimaryButton";

interface AvatarPickerProps {
  className?: string;
  value?: string | null;
  onChange: (url: string | null) => void;
}

export default function AvatarPicker({ className, value, onChange }: AvatarPickerProps) {
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    const max = 8 * 1024 * 1024;
    if (file.size > max) {
      setError("Image too large. Max size is 8MB.");
      return;
    }
    const localUrl = URL.createObjectURL(file);
    onChange(localUrl);
    const form = new FormData();
    form.append("avatar", file);
    setUploading(true);
    try {
      const resp = await fetch(`${SERVER_URL}/upload/avatar`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) throw new Error(`upload_failed_${resp.status}`);
      const data = await resp.json();
      if (data?.url) {
        const u = String(data.url);
        const next = /^https?:\/\//i.test(u) ? u : `${SERVER_URL}${u}`;
        onChange(next);
        URL.revokeObjectURL(localUrl);
      }
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      {error && <AlertBanner kind="error" message={error} />}
      <div className="flex items-center gap-4">
        <div className="h-32 w-32 shrink-0 rounded-full border border-black/30 bg-white/10 overflow-hidden ring-1 ring-white/20">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Avatar preview" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grid place-items-center text-white/50 text-xs">No</div>
          )}
        </div>
        <label className="cursor-pointer" htmlFor={inputId}>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.currentTarget.value = "";
            }}
            disabled={uploading}
          />
          <span className="inline-flex">
            <span className="pointer-events-none">
              <PrimaryButton type="button" className="px-5 py-2 text-sm font-semibold">
                {uploading ? "Uploading…" : "Upload"}
              </PrimaryButton>
            </span>
          </span>
        </label>
      </div>
      <p className="mt-2 text-xs text-white/60">Recommended: square image. Max 8MB.</p>
    </div>
  );
}
