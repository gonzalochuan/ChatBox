"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useId } from "react";
import { SERVER_URL } from "@/lib/config";
import { useConnection } from "@/store/useConnection";
import { getToken } from "@/lib/auth";

interface SummaryResponse {
  users: number;
  roleCounts: { students: number; teachers: number; admins: number };
  messages: number;
  channels: number;
  latestMessages: {
    id: string;
    channelId: string;
    senderName: string;
    text: string;
    createdAt: string;
    priority: string;
  }[];
}

interface UsageResponse {
  period: string;
  days: {
    date: string;
    messages: number;
  }[];
}

export default function AdminAnalyticsPage() {
  const { baseUrl } = useConnection();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      if (!token) throw new Error("no_token");
      const [summaryRes, usageRes] = await Promise.all([
        fetch(`${apiBase}/admin/stats/summary`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${apiBase}/admin/stats/usage`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      if (!summaryRes.ok) throw new Error(`summary_${summaryRes.status}`);
      if (!usageRes.ok) throw new Error(`usage_${usageRes.status}`);
      const summaryJson = await summaryRes.json();
      const usageJson = await usageRes.json();
      setSummary(summaryJson);
      setUsage(usageJson);
    } catch (e: any) {
      setError(e?.message || "Failed to load analytics");
      setSummary(null);
      setUsage(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const cards = summary
    ? [
        {
          label: "Total Users",
          value: summary.users,
        },
        {
          label: "Admins",
          value: summary.roleCounts.admins,
        },
        {
          label: "Teachers",
          value: summary.roleCounts.teachers,
        },
        {
          label: "Students",
          value: summary.roleCounts.students,
        },
        {
          label: "Channels",
          value: summary.channels,
        },
        {
          label: "Messages",
          value: summary.messages,
        },
      ]
    : [];

  const maxMessages = usage?.days.reduce((max, day) => Math.max(max, day.messages), 0) || 1;

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_1fr] min-h-0">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs md:text-sm text-white/80"
            >
              <span className="sr-only">Back to Dashboard</span>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">SYSTEM & ANALYTICS</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-white/70">
            <button onClick={load} className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1">
              Refresh Data
            </button>
          </div>
        </header>

        <div className="p-3 sm:p-4 space-y-4 overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          )}

          <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {loading && cards.length === 0 ? (
              <PlaceholderCards count={6} />
            ) : (
              cards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-3 sm:p-4">
                  <div className="text-[10px] uppercase tracking-[0.35em] text-white/50">{card.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{formatNumber(card.value)}</div>
                </div>
              ))
            )}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3 sm:gap-4">
            <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.35em] text-white/50">Messages (7 Days)</div>
                  <div className="text-sm text-white/70">Daily message volume</div>
                </div>
                <div className="text-xs text-white/50">Period: {usage?.period ?? "—"}</div>
              </div>
              <div className="mt-4 flex-1 min-h-[12rem] sm:min-h-[14rem] relative">
                {usage?.days.length ? (
                  <MiniLineChart data={usage.days} max={maxMessages} />
                ) : (
                  <EmptyState message={loading ? "Loading…" : "No usage data"} />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4 flex flex-col">
              <div className="text-[10px] uppercase tracking-[0.35em] text-white/50">Recent Messages</div>
              <div className="mt-2 text-sm text-white/70">Last activity across channels</div>
              <div className="mt-3 flex-1 overflow-y-auto space-y-3">
                {summary?.latestMessages.length ? (
                  summary.latestMessages.map((msg) => (
                    <div key={msg.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <div className="flex justify-between text-[11px] text-white/50">
                        <span className="uppercase tracking-[0.35em]">{formatPriority(msg.priority)}</span>
                        <span>{formatTimestamp(msg.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white break-words">{msg.senderName}</div>
                      <div className="mt-1 text-sm text-white/80 line-clamp-3 break-words">{msg.text}</div>
                      <div className="mt-2 text-[11px] text-white/50">Channel: {msg.channelId}</div>
                    </div>
                  ))
                ) : (
                  <EmptyState message={loading ? "Loading…" : "No recent messages"} />
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MiniLineChart({ data, max }: { data: { date: string; messages: number }[]; max: number }) {
  const uid = useId();
  const W = 1000;
  const H = 200; // height used for the SVG chart area; labels are rendered below
  const padTop = 8;
  const padBottom = 4; // minimal bottom padding now that labels are below
  const chartH = H - padTop - padBottom;

  const n = Math.max(1, data.length);
  const stepX = n > 1 ? W / (n - 1) : 0;

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = padTop + (1 - (max ? d.messages / max : 0)) * chartH;
    return { x, y };
  });

  const linePath = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : acc + ` L ${p.x},${p.y}`), "");
  const areaPath = points.length
    ? `M ${points[0].x},${H - padBottom} ` + points.map((p) => `L ${p.x},${p.y}`).join(" ") + ` L ${points[points.length - 1].x},${H - padBottom} Z`
    : "";

  const showPoints = n <= 14; // hide dots when many points
  const maxXTicks = 7;
  const tickStep = Math.max(1, Math.ceil(n / maxXTicks));

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id={`${uid}-lineGrad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.5)" />
            </linearGradient>
            <linearGradient id={`${uid}-fillGrad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </linearGradient>
          </defs>

          {Array.from({ length: 4 }).map((_, i) => {
            const y = padTop + (i / 4) * chartH;
            return <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
          })}

          {areaPath && <path d={areaPath} fill={`url(#${uid}-fillGrad)`} />}
          {linePath && (
            <path d={linePath} fill="none" stroke={`url(#${uid}-lineGrad)`} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {showPoints &&
            points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" fillOpacity={0.9} />)}
        </svg>
      </div>

      <div className="px-1 mt-auto pb-1 flex justify-between gap-2">
        {data.map((d, i) => (
          <div key={d.date} className="min-w-0 text-center flex flex-col gap-[2px]">
            {i % tickStep === 0 ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 leading-tight">{formatDayLabel(d.date)}</div>
                <div className="text-[10px] text-white/60 leading-tight">{formatNumber(d.messages)}</div>
              </>
            ) : (
              <div className="h-[16px]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaceholderCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="rounded-2xl border border-white/10 bg-white/10 h-24 animate-pulse" />
      ))}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 grid place-items-center text-sm text-white/60 min-h-[120px]">
      {message}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatTimestamp(value: string) {
  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch {
    return value;
  }
}

function formatDayLabel(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatPriority(priority: string) {
  switch (priority?.toLowerCase()) {
    case "urgent":
      return "Urgent";
    case "high":
      return "High";
    case "low":
      return "Low";
    default:
      return "Normal";
  }
}
