"use client";

import React from "react";

interface AlertBannerProps {
  kind?: "success" | "error" | "info";
  message: string;
}

// Simple glassy banner matching the app's UI tone
export default function AlertBanner({ kind = "info", message }: AlertBannerProps) {
  const color =
    kind === "success"
      ? "border-green-500/25 bg-green-500/10 text-[color:var(--foreground)]"
      : kind === "error"
        ? "border-red-500/25 bg-red-500/10 text-[color:var(--foreground)]"
        : "border-[color:var(--border)] bg-[color:var(--surface)]/60 text-[color:var(--foreground)]";
  return (
    <div className={`pointer-events-none fixed top-4 left-0 right-0 z-[100] flex justify-center animate-in fade-in slide-in-from-top-2 duration-300`}> 
      <div className={`pointer-events-auto max-w-xl w-[92%] sm:w-auto rounded-xl border ${color} backdrop-blur-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.20)] px-4 py-2 text-sm text-center`}> 
        {message}
      </div>
    </div>
  );
}
