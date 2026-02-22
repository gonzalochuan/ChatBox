"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ActivityLog } from "@/types";
import { SERVER_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";
import { useConnection } from "@/store/useConnection";

interface ActivityResponse {
  items: ActivityLog[];
  nextCursor?: string | null;
}

export default function AdminActivityPage() {
  const { baseUrl } = useConnection();
  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [actorId, setActorId] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const fetchLogs = async (opts?: { append?: boolean; cursor?: string | null }) => {
    setError(null);
    setLoading(true);
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      const params = new URLSearchParams();
      if (kind.trim()) params.set("kind", kind.trim());
      if (actorId.trim()) params.set("actorId", actorId.trim());
      if (subjectType.trim()) params.set("subjectType", subjectType.trim());
      if (subjectId.trim()) params.set("subjectId", subjectId.trim());
      if (opts?.cursor) params.set("cursor", opts.cursor);
      params.set("limit", "50");
      const res = await fetch(`${apiBase}/admin/activity?${params.toString()}` , {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
      const data: ActivityResponse = await res.json();
      setNextCursor(data.nextCursor || null);
      setLogs((prev) => (opts?.append ? [...prev, ...(data.items || [])] : (data.items || [])));
    } catch (e: any) {
      setError(e?.message || "Failed to load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_auto_1fr] min-h-0">
        <header className="flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs md:text-sm text-white/80"
            >
              <span className="sr-only">Back to Dashboard</span>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">ACTIVITY LOGS</div>
          </div>
          <div className="text-xs text-white/70 flex items-center gap-2">
            <button
              onClick={() => fetchLogs()}
              className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1"
            >
              Refresh
            </button>
          </div>
        </header>

        <div className="px-3 md:px-4 py-3 border-b border-white/10 bg-black/30">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="Kind (e.g. banner.create)"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
            />
            <input
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              placeholder="Actor ID"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
            />
            <input
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value)}
              placeholder="Subject Type (e.g. banner)"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
            />
            <input
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Subject ID"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => fetchLogs()}
                className="flex-1 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 px-3 py-2"
              >
                Apply
              </button>
              <button
                onClick={() => { setKind(""); setActorId(""); setSubjectType(""); setSubjectId(""); fetchLogs(); }}
                className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-2"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 md:p-4 overflow-y-auto space-y-3">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 px-3 py-2 text-sm">{error}</div>
          )}
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-lg">
            <div className="divide-y divide-white/10">
              {logs.length === 0 && !loading && (
                <div className="px-4 py-6 text-sm text-white/60">No activity.</div>
              )}
              {logs.map((log) => (
                <div key={log.id} className="px-4 sm:px-6 py-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-white/75">{log.kind}</span>
                      {log.subjectType && (
                        <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-white/70">{log.subjectType}{log.subjectId ? `:${log.subjectId}` : ""}</span>
                      )}
                    </div>
                    <div className="text-white whitespace-pre-wrap break-words text-sm">{log.message}</div>
                    <div className="text-[11px] text-white/50">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.actorName ? ` • ${log.actorName}` : log.actorId ? ` • ${log.actorId}` : ""}
                    </div>
                    {log.data && (
                      <pre className="mt-1 text-[11px] text-white/60 bg-black/30 rounded-lg p-2 overflow-auto max-h-40">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-white/10 flex justify-between items-center">
              <div className="text-xs text-white/60">{logs.length} item(s)</div>
              <div className="flex gap-2">
                <button
                  disabled={!nextCursor || loading}
                  onClick={() => fetchLogs({ append: true, cursor: nextCursor })}
                  className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs disabled:opacity-50"
                >
                  Load more
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
