"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SERVER_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";
import { useConnection } from "@/store/useConnection";
import type { Banner, BannerKind } from "@/types";

interface EditableBanner extends Banner {
  startsAt?: string | null;
  endsAt?: string | null;
}

const dateLabelFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateLabelFormatter.format(date);
}

const KIND_OPTIONS: BannerKind[] = ["info", "success", "error"];

function toLocalInput(value?: string | null) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const off = date.getTimezoneOffset();
    const local = new Date(date.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function fromLocalInput(value: string) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

export default function AdminBannersPage() {
  const { baseUrl } = useConnection();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<EditableBanner | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Banner | null>(null);

  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/admin/banners`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`list_failed_${res.status}`);
      const data = await res.json();
      setBanners(data.banners || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [apiBase]);

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_1fr] min-h-0">
        <header className="flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs md:text-sm text-white/80"
            >
              <span className="sr-only">Back to Dashboard</span>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">BANNERS & ALERTS</div>
          </div>
          <div className="text-xs text-white/70 flex items-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1"
            >
              New Banner
            </button>
            <button
              onClick={load}
              className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1"
            >
              Refresh
            </button>
          </div>
        </header>

        <div className="p-3 md:p-4 space-y-3 overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
              {error}
            </div>
          )}
          {loading ? (
            <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-sm px-4 py-6 text-white/70 text-sm">
              Loading…
            </div>
          ) : banners.length === 0 ? (
            <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-sm px-4 py-6 text-white/60 text-sm">
              No banners yet. Create one to broadcast an alert.
            </div>
          ) : (
            <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-lg shadow-[0_20px_80px_-32px_rgba(0,0,0,0.8)]">
              <div className="grid grid-cols-1 divide-y divide-white/10">
                {banners.map((banner) => (
                  <BannerRow
                    key={banner.id}
                    banner={banner}
                    onEdit={() => setEditing(banner)}
                    onDelete={() => setConfirmDelete(banner)}
                    onToggle={async () => {
                      try {
                        const token = getToken();
                        if (!token) throw new Error("no_token");
                        await fetch(`${apiBase}/admin/banners/${banner.id}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ isActive: !banner.isActive }),
                        });
                        load();
                      } catch (e: any) {
                        setError(e?.message || "Failed to update banner");
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <BannerModal
          title="Create Banner"
          initial={null}
          onClose={() => setShowAdd(false)}
          onSubmit={async (payload) => {
            try {
              const token = getToken();
              if (!token) throw new Error("no_token");
              await fetch(`${apiBase}/admin/banners`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
              });
              setShowAdd(false);
              load();
            } catch (e: any) {
              setError(e?.message || "Failed to create banner");
            }
          }}
        />
      )}

      {editing && (
        <BannerModal
          title="Edit Banner"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            try {
              const token = getToken();
              if (!token) throw new Error("no_token");
              await fetch(`${apiBase}/admin/banners/${editing.id}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
              });
              setEditing(null);
              load();
            } catch (e: any) {
              setError(e?.message || "Failed to update banner");
            }
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Banner"
          message={`Are you sure you want to remove "${confirmDelete.title}"?`}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try {
              const token = getToken();
              if (!token) throw new Error("no_token");
              await fetch(`${apiBase}/admin/banners/${confirmDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              setConfirmDelete(null);
              load();
            } catch (e: any) {
              setError(e?.message || "Failed to delete banner");
            }
          }}
        />
      )}
    </div>
  );
}

function BannerRow({
  banner,
  onEdit,
  onDelete,
  onToggle,
}: {
  banner: Banner;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 xl:gap-8 px-4 sm:px-6 py-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 uppercase tracking-widest text-[11px] text-white/75">
            {banner.kind}
          </span>
          {banner.isActive && (
            <span className="rounded-full border border-green-400/40 bg-green-500/10 px-2.5 py-0.5 text-[11px] text-green-300">
              Active
            </span>
          )}
        </div>
        <div className="text-xl sm:text-2xl font-semibold text-white whitespace-pre-wrap break-words">{banner.title}</div>
        <div className="text-sm sm:text-base text-white/75 whitespace-pre-wrap break-words">{banner.message}</div>
        <div className="text-xs sm:text-[13px] text-white/55">
          {banner.startsAt ? `Starts ${formatDateLabel(banner.startsAt)}` : "Starts immediately"}
          {" • "}
          {banner.endsAt ? `Ends ${formatDateLabel(banner.endsAt)}` : "No end"}
        </div>
        <div className="text-[11px] sm:text-xs text-white/35">
          Updated {formatDateLabel(banner.updatedAt)}
        </div>
      </div>
      <div className="flex flex-wrap md:flex-col gap-2 justify-end md:items-end">
        <button
          onClick={onToggle}
          className={`rounded-lg border px-3 py-1 text-xs ${banner.isActive ? "border-yellow-400/40 bg-yellow-500/10 text-yellow-200" : "border-white/20 bg-white/5 hover:bg-white/10"}`}
        >
          {banner.isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          onClick={onEdit}
          className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1 text-xs"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function BannerModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: EditableBanner | null;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    message: string;
    kind: BannerKind;
    isActive: boolean;
    startsAt: string | null;
    endsAt: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.title || "");
  const [message, setMessage] = useState(initial?.message || "");
  const [kind, setKind] = useState<BannerKind>(initial?.kind || "info");
  const [isActive, setIsActive] = useState(initial?.isActive || false);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt || null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt || null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!name.trim()) throw new Error("Title is required");
      if (!message.trim()) throw new Error("Message is required");
      await onSubmit({
        title: name.trim(),
        message: message.trim(),
        kind,
        isActive,
        startsAt: fromLocalInput(startsAt),
        endsAt: fromLocalInput(endsAt),
      });
    } catch (e: any) {
      setError(e?.message || "Failed to save banner");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white">×</button>
        </div>
        {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Banner title"
            className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Banner message"
            className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
          />
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Kind</label>
              <div className="flex gap-2">
                {KIND_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    className={`rounded-full px-3 py-1 text-xs border ${kind === option ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="banner-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="banner-active" className="text-sm text-white/70">Active</label>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Starts at</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-2xl border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/25"
              />
            </div>
            <div className="flex flex-col">
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Ends at</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-2xl border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/25"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
          <button
            disabled={saving}
            onClick={submit}
            className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 px-3 py-1.5"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4">
        <div className="text-lg font-semibold mb-2">{title}</div>
        <div className="text-sm text-white/70 mb-4">{message}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
          <button onClick={onConfirm} className="rounded-xl border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5">Delete</button>
        </div>
      </div>
    </div>
  );
}
