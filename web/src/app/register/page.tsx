"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SparkleGridOverlay from "@/components/SparkleGridOverlay";
import { SERVER_URL } from "@/lib/config";
import AlertBanner from "@/components/AlertBanner";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [studentId, setStudentId] = useState("");
  const [subjectCodes, setSubjectCodes] = useState<string[]>([]);
  const [subjectInput, setSubjectInput] = useState("");
  const [schedules, setSchedules] = useState("");
  const [yearLevel, setYearLevel] = useState("1");
  const [block, setBlock] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const yearMenuRef = useRef<HTMLDivElement | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const yl = (yearLevel || "").trim();
      const bl = (block || "").trim();
      if (!yl || !bl) {
        setSuggested([]);
        return;
      }
      try {
        setSuggestLoading(true);
        const res = await fetch(`${SERVER_URL}/public/section-subjects?yearLevel=${encodeURIComponent(yl)}&block=${encodeURIComponent(bl)}`);
        if (!res.ok) throw new Error("suggest_failed");
        const data = await res.json();
        if (!cancelled) {
          const list = Array.isArray(data?.subjects) ? data.subjects : [];
          setSuggested(list);
        }
      } catch {
        if (!cancelled) setSuggested([]);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [yearLevel, block]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // basic validation
    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = "Required";
    if (!password.trim()) nextErrors.password = "Required";
    if (!studentId.trim()) nextErrors.studentId = "Required";
    if (!yearLevel.trim()) nextErrors.yearLevel = "Required";
    // section removed; block is enough
    if (!block.trim()) nextErrors.block = "Required";
    if (!schedules.trim()) nextErrors.schedules = "Required";
    if (subjectCodes.length === 0) nextErrors.subjectCodes = "Add at least 1 subject";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const normalizedEmail = email.trim();
      const resp = await fetch(`${SERVER_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nickname,
          email: normalizedEmail,
          password,
          studentId,
          yearLevel,
          block,
          avatarUrl: avatarUrl || null,
          subjectCodes,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const code = data?.error;
        if (code === "email_exists") {
          throw new Error("Email is already registered. Please sign in or use a different email.");
        }
        throw new Error(code || `Registration failed (${resp.status})`);
      }
      // const data = await resp.json(); // not auto-logging in
      setSuccessMsg("Account created successfully. Redirecting to Sign in…");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err: any) {
      setSubmitError(err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] text-white bg-black overflow-hidden">
      {submitError && <AlertBanner kind="error" message={submitError} />}
      {successMsg && <AlertBanner kind="success" message={successMsg} />}
      {/* Background to match Intro/Login */}
      <video
        className="pointer-events-none fixed inset-0 w-full h-full object-cover opacity-[0.06]"
        src="/chat.mp4"
        muted
        loop
        autoPlay
        playsInline
      />
      <div className="grid-layer" />
      <SparkleGridOverlay />

      {/* Top chrome */}
      <div className="absolute top-6 left-6 z-30 text-xs md:text-sm tracking-widest text-white/80 font-ethno-bold">CB</div>
      <Link href="/" className="absolute top-6 right-6 z-30 text-xs md:text-sm tracking-wider text-white/80 hover:text-white">Back</Link>

      {/* Card */}
      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 pt-24 sm:pt-28">
        <div className="w-full max-w-2xl sm:max-w-xl rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_10px_40px_-10px_rgba(0,0,0,0.6)] p-6 sm:p-8">
          <h1 className="text-2xl font-akira-bold tracking-wide">Create account</h1>
          <p className="text-sm text-white/70 mt-4">Join ChatBox and your assigned groups</p>

          <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {submitError && (
              <div className="sm:col-span-2 text-sm text-red-400/90 border border-red-400/40 rounded-xl bg-red-500/10 px-3 py-2">
                {submitError}
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-white/60">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="Juan Dela Cruz"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className={`mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="e.g., Juan, JD, Cruz"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Profile picture</label>
              <div className="mt-2 flex items-center gap-4">
                <div className="h-32 w-32 shrink-0 aspect-square rounded-full border border-white/30 bg-white/10 overflow-hidden ring-1 ring-white/20">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Avatar preview" className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-white/50">No</div>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-start">
                  <div className="text-xs text-white/50">Recommended: square image. Max 8MB.</div>
                  <label className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-md px-3 py-2 text-sm cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // 8MB client-side check
                        const max = 8 * 1024 * 1024;
                        if (file.size > max) {
                          setSubmitError("Image too large. Max size is 8MB.");
                          return;
                        }
                        // Show instant local preview
                        const localUrl = URL.createObjectURL(file);
                        setAvatarUrl(localUrl);
                        const form = new FormData();
                        form.append("avatar", file);
                        try {
                          const up = await fetch(`${SERVER_URL}/upload/avatar`, {
                            method: "POST",
                            body: form,
                          });
                          if (!up.ok) {
                            throw new Error(`Upload failed (${up.status})`);
                          }
                          const data = await up.json();
                          if (data?.url) {
                            const u = String(data.url);
                            const next = /^https?:\/\//i.test(u) ? u : `${SERVER_URL}${u}`;
                            setAvatarUrl(next);
                            // Optionally revoke local blob URL
                            try { URL.revokeObjectURL(localUrl); } catch {}
                          }
                        } catch (err: any) {
                          setSubmitError(err?.message || "Upload failed. Please try again.");
                          // If upload fails, keep local preview but it won't persist
                        }
                      }}
                    />
                    <span>Upload</span>
                  </label>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Email <span className="text-red-400">*</span></label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-2 w-full rounded-xl border ${errors.email ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="name@school.edu"
              />
              {errors.email && <p className="mt-1 text-xs text-red-400/90">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Password <span className="text-red-400">*</span></label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`mt-2 w-full rounded-xl border ${errors.password ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="••••••••"
              />
              {errors.password && <p className="mt-1 text-xs text-red-400/90">{errors.password}</p>}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Student ID <span className="text-red-400">*</span></label>
              <input
                type="text"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className={`mt-2 w-full rounded-xl border ${errors.studentId ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="2025-12345"
              />
              {errors.studentId && <p className="mt-1 text-xs text-red-400/90">{errors.studentId}</p>}
            </div>
            {/* Custom glass dropdown for Year Level */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Year Level <span className="text-red-400">*</span></label>
              <div className="relative mt-2" ref={yearMenuRef}>
                <button type="button" onClick={() => setYearOpen((v) => !v)} className={`w-full rounded-xl border ${errors.yearLevel ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-left text-white/90 outline-none focus:ring-2 focus:ring-white/30 flex items-center justify-between`}>
                  <span>{yearLevel || "Select year level"}</span>
                  <span className="text-white/60">▾</span>
                </button>
                {yearOpen && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/15 bg-black/80 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                    {(["1", "2", "3", "4"] as const).map((yl) => (
                      <button
                        key={yl}
                        type="button"
                        onClick={() => {
                          setYearLevel(yl);
                          setYearOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm hover:bg-white/10 ${yearLevel === yl ? "bg-white/10" : ""}`}
                      >
                        Year {yl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.yearLevel && <p className="mt-1 text-xs text-red-400/90">{errors.yearLevel}</p>}
            </div>
            {/* Section removed (block is sufficient) */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Block <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                className={`mt-2 w-full rounded-xl border ${errors.block ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="B1"
              />
              {errors.block && <p className="mt-1 text-xs text-red-400/90">{errors.block}</p>}
              {yearLevel && block ? (
                <p className="mt-1 text-xs text-white/50">Section: {`SEC-${yearLevel}-${(block || "").toUpperCase()}`}</p>
              ) : null}
            </div>
            {/* Subject Codes chip input */}
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-white/60">Subject Codes <span className="text-red-400">*</span></label>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2.5">
                {subjectCodes.map((code, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm">
                    {code}
                    <button type="button" aria-label={`Remove ${code}`} className="text-white/70 hover:text-white" onClick={() => setSubjectCodes(subjectCodes.filter((_, i) => i !== idx))}>×</button>
                  </span>
                ))}
                <input
                  value={subjectInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Check if the last character is a space, comma, or newline
                    const lastChar = value[value.length - 1];
                    if (lastChar === ' ' || lastChar === ',' || lastChar === '\n') {
                      const input = value.trim();
                      if (input) {
                        const codes = input
                          .split(/[,\s\n]+/)
                          .map(code => code.trim().toUpperCase())
                          .filter(code => code && !subjectCodes.includes(code));
                        
                        if (codes.length > 0) {
                          setSubjectCodes([...subjectCodes, ...codes]);
                          setSubjectInput("");
                          return;
                        }
                      }
                      setSubjectInput("");
                    } else {
                      setSubjectInput(value);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Handle backspace to remove last subject
                    if (e.key === "Backspace" && !subjectInput && subjectCodes.length) {
                      e.preventDefault();
                      setSubjectCodes(subjectCodes.slice(0, -1));
                    }
                  }}
                  placeholder="Type subject codes and press space or enter"
                  className="flex-1 min-w-[160px] bg-transparent text-white placeholder-white/40 outline-none"
                  inputMode="text"
                  autoCapitalize="characters"
                />
              </div>
              {errors.subjectCodes ? (
                <p className="mt-1 text-xs text-red-400/90">{errors.subjectCodes}</p>
              ) : (
                <>
                  <p className="mt-3 text-xs text-white/50">Select your Year and Block, then enter your subjects. We'll auto-join the subject channels.</p>
                  <div className="mt-2">
                    <div className="text-[11px] text-white/60 mb-1">Suggested for Section {yearLevel && block ? `SEC-${yearLevel}-${(block||"").toUpperCase()}` : "—"}{suggestLoading ? " (loading…)" : ""}</div>
                    <div className="flex flex-wrap gap-2">
                      {suggested.length === 0 ? (
                        <span className="text-[11px] text-white/40">No suggestions yet.</span>
                      ) : (
                        suggested.map((code) => (
                          <button
                            type="button"
                            key={code}
                            onClick={() => {
                              const cleaned = String(code || "").trim().toUpperCase();
                              if (cleaned && !subjectCodes.includes(cleaned)) setSubjectCodes([...subjectCodes, cleaned]);
                            }}
                            className="text-[11px] px-2 py-0.5 rounded-full border border-white/25 bg-white/10 hover:bg-white/15"
                          >
                            {code}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-white/60">Schedules <span className="text-red-400">*</span></label>
              <textarea
                required
                value={schedules}
                onChange={(e) => setSchedules(e.target.value)}
                rows={3}
                className={`mt-2 w-full rounded-xl border ${errors.schedules ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30`}
                placeholder="e.g., MWF 9:00-10:00 CS101 Room 203; TTh 1:00-2:30 MATH201 ..."
              />
              {errors.schedules ? (
                <p className="mt-1 text-xs text-red-400/90">{errors.schedules}</p>
              ) : (
                <p className="mt-1 text-xs text-white/50">You can paste your timetable; we’ll auto-detect blocks/sections.</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full border border-white/25 bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-md py-3 font-medium tracking-wide transition-colors disabled:opacity-60"
              >
                {loading ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>

          <div className="mt-5 text-sm text-white/70">
            Already have an account? <Link href="/login" className="hover:text-white">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

