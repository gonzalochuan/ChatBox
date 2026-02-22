"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@/store/useConnection";
import { fetchMe } from "@/lib/api";
import { SERVER_URL } from "@/lib/config";

export default function TeacherHome() {
  const { mode, baseUrl } = useConnection();
  const [authorized, setAuthorized] = useState<null | boolean>(null);

  useEffect(() => {
    (async () => {
      try {
        const target = baseUrl || SERVER_URL;
        const me = await fetchMe(target);
        const roles: string[] = me?.user?.roles || [];
        setAuthorized(roles.includes("TEACHER") || roles.includes("ADMIN"));
      } catch {
        setAuthorized(false);
      }
    })();
  }, [mode, baseUrl]);

  if (authorized === null) {
    return <div className="p-6 text-white/70">Checking access…</div>;
  }
  if (!authorized) {
    return <div className="p-6 text-red-300">Not authorized. Teacher role required.</div>;
  }

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_1fr] min-h-0">
        <header className="flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="font-ethno-bold tracking-widest text-sm md:text-base">TEACHER</div>
          <div className="text-xs text-white/70">Mode: {mode.toUpperCase()}</div>
        </header>
        <div className="p-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <a href="/teacher/sections" className="rounded-2xl border border-white/15 bg-black/40 p-4 hover:bg-white/5">
            <div className="text-lg font-semibold">Sections & Subjects</div>
            <div className="text-white/70 text-sm">Manage class sections and subject groups.</div>
          </a>
          <a href="/teacher/chat" className="rounded-2xl border border-white/15 bg-black/40 p-4 hover:bg-white/5">
            <div className="text-lg font-semibold">Messages</div>
            <div className="text-white/70 text-sm">Open chat with global, section, and DM conversations.</div>
          </a>
          <a href="/teacher/banners" className="rounded-2xl border border-white/15 bg-black/40 p-4 hover:bg-white/5">
            <div className="text-lg font-semibold">Banners & Alerts</div>
            <div className="text-white/70 text-sm">Create section-level banners and urgent alerts.</div>
          </a>
          <a href="/teacher/activity" className="rounded-2xl border border-white/15 bg-black/40 p-4 hover:bg-white/5">
            <div className="text-lg font-semibold">Activity</div>
            <div className="text-white/70 text-sm">View engagement and activity logs.</div>
          </a>
        </div>
      </div>
    </div>
  );
}
