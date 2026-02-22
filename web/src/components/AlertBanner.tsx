"use client";

import React from "react";

interface AlertBannerProps {
  kind?: "success" | "error" | "info";
  message: string;
}

// Simple glassy banner matching the app's UI tone
export default function AlertBanner({ kind = "info", message }: AlertBannerProps) {
  const color = kind === "success" ? "border-green-400/40 bg-green-500/10 text-green-300" : kind === "error" ? "border-red-400/40 bg-red-500/10 text-red-300" : "border-white/30 bg-white/10 text-white";
  return (
    <div className={`pointer-events-none fixed top-4 left-0 right-0 z-[100] flex justify-center animate-in fade-in slide-in-from-top-2 duration-300`}> 
      <div className={`pointer-events-auto max-w-xl w-[92%] sm:w-auto rounded-xl border ${color} backdrop-blur-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] px-4 py-2 text-sm text-center`}> 
        {message}
      </div>
    </div>
  );
}
