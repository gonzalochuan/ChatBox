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
interface TeacherMe {
  user: {
    id: string;
    email: string;
    name: string | null;
    nickname: string | null;
    schedule: string | null;
    avatarUrl: string | null;
    yearLevel: string | null;
    block: string | null;
    profession: string | null;
  };
}
interface SectionEngagement {
  period: string;
  students: Array<{ id: string; name: string; email: string; studentId: string | null; messages: number; lastActiveAt: string | null }>;
}
interface SubjectEngagement {
  period: string;
  subject: string;
  students: Array<{ id: string; name: string; email: string; studentId: string | null; messages: number; lastActiveAt: string | null }>;
}
interface TeacherSections {
  subjects: Array<{ id: string; name: string; channelId: string }>;
}

export default function TeacherActivityPage() {
  const { baseUrl } = useConnection();
  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"students" | "engagement" | "logs">("students");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [me, setMe] = useState<TeacherMe["user"] | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    email: string;
    name: string | null;
    nickname: string | null;
    studentId: string | null;
    yearLevel: string | null;
    block: string | null;
    schedule: string | null;
    avatarUrl: string | null;
    profession: string | null;
  } | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);

  const [engView, setEngView] = useState<"section" | "subject">("section");
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("7d");
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; channelId: string }>>([]);
  const [subjectCode, setSubjectCode] = useState<string>("");
  const [engRows, setEngRows] = useState<Array<{ id: string; name: string; email: string; studentId: string | null; messages: number; lastActiveAt: string | null }>>([]);
  const [hasSection, setHasSection] = useState<boolean>(false);

  const fetchLogs = async (opts?: { append?: boolean; cursor?: string | null }) => {
    setError(null);
    setLoading(true);
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      const params = new URLSearchParams();
      if (opts?.cursor) params.set("cursor", opts.cursor);
      params.set("limit", "50");
      const res = await fetch(`${apiBase}/teacher/activity/groups?${params.toString()}`, {
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

  const fetchMe = async () => {
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`me_failed_${res.status}`);
      const data: TeacherMe = await res.json();
      setMe(data.user);
    } catch (e: any) {
      setError(e?.message || "Failed to load profile");
    }
  };

  const fetchStudent = async (id: string) => {
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/students/${id}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`student_failed_${res.status}`);
      const data: { user: any } = await res.json();
      setSelectedStudent(data.user);
    } catch (e: any) {
      setError(e?.message || "Failed to load student");
    }
  };

  const saveStudent = async () => {
    if (!selectedStudentId || !selectedStudent) return;
    try {
      setSavingStudent(true);
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/students/${selectedStudentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: selectedStudent.name,
          nickname: selectedStudent.nickname,
          schedule: selectedStudent.schedule,
          avatarUrl: selectedStudent.avatarUrl,
        }),
      });
      if (!res.ok) throw new Error(`student_save_failed_${res.status}`);
      fetchLogs();
    } catch (e: any) {
      setError(e?.message || "Failed to save student");
    } finally {
      setSavingStudent(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/audience`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`audience_failed_${res.status}`);
      const data: any = await res.json();
      const hasSec = !!(data as any).section;
      setHasSection(hasSec);
      const subs = (data.subjects || []).map((s: any) => {
        const code = typeof s === "string" ? s : (s?.subjectId || s?.id || "");
        return { id: String(code), name: String(code), channelId: String(code) };
      }).filter((s: any) => !!s.id);
      setSubjects(subs);
      if (subs.length > 0) {
        setSubjectCode(subs[0].id);
      }
      // Prefer Section when available; else Subject when any exists
      if (hasSec) setEngView("section"); else if (subs.length > 0) setEngView("subject");
    } catch (e: any) {
      setError(e?.message || "Failed to load audience");
    }
  };

  const fetchEngagement = async () => {
    try {
      const token = getToken();
      if (!token) throw new Error("no_token");
      if (engView === "section") {
        if (!hasSection) {
          const res = await fetch(`${apiBase}/teacher/students?scope=all&period=${period}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!res.ok) throw new Error(`stu_all_failed_${res.status}`);
          const data: { students: any[] } = await res.json();
          setEngRows((data as any).students || []);
        } else {
          const res = await fetch(`${apiBase}/teacher/engagement/section?period=${period}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!res.ok) throw new Error(`eng_section_failed_${res.status}`);
          const data: SectionEngagement = await res.json();
          setEngRows(data.students || []);
        }
      } else {
        if (!subjectCode) {
          const res = await fetch(`${apiBase}/teacher/students?scope=all&period=${period}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!res.ok) throw new Error(`stu_all_failed_${res.status}`);
          const data: { students: any[] } = await res.json();
          setEngRows((data as any).students || []);
          return;
        }
        const res = await fetch(`${apiBase}/teacher/engagement/subject?code=${encodeURIComponent(subjectCode)}&period=${period}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!res.ok) throw new Error(`eng_subject_failed_${res.status}`);
        const data: SubjectEngagement = await res.json();
        setEngRows(data.students || []);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load engagement");
    }
  };

  useEffect(() => {
    fetchMe();
    fetchSubjects();
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    fetchEngagement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engView, period, subjectCode, apiBase]);

  useEffect(() => {
    if (tab === "logs") {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, apiBase]);

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_auto_1fr] min-h-0">
        <header className="flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/teacher"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs md:text-sm text-white/80"
            >
              <span className="sr-only">Back to Dashboard</span>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">ACTIVITY</div>
          </div>
          <div className="text-xs text-white/70 flex items-center gap-2">
            <button onClick={() => fetchLogs()} className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1">Refresh</button>
          </div>
        </header>

        <div className="px-3 md:px-4 py-3 border-b border-white/10 bg-black/30">
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={() => setTab("students")} className={`rounded-full px-3 py-1 text-xs border ${tab === "students" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Students</button>
            <button onClick={() => setTab("engagement")} className={`rounded-full px-3 py-1 text-xs border ${tab === "engagement" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Engagement</button>
            <button onClick={() => setTab("logs")} className={`rounded-full px-3 py-1 text-xs border ${tab === "logs" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Logs</button>
          </div>

          {tab === "logs" && null}
        </div>

        <div className="p-3 md:p-4 overflow-y-auto space-y-3">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 px-3 py-2 text-sm">{error}</div>
          )}
          {tab === "students" && (
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-lg p-4 space-y-3">
            {/* Controls reuse */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => setEngView("section")} className={`rounded-full px-3 py-1 border ${engView === "section" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Section</button>
              <button onClick={() => setEngView("subject")} className={`rounded-full px-3 py-1 border ${engView === "subject" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Subject</button>
              <div className="ml-auto flex gap-2">
                <select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="rounded-lg bg-black/30 border border-white/20 px-2 py-1 text-xs">
                  <option value="24h">24h</option>
                  <option value="7d">7d</option>
                  <option value="30d">30d</option>
                </select>
                {engView === "subject" && (
                  <select value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} className="rounded-lg bg-black/30 border border-white/20 px-2 py-1 text-xs">
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.id}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-white/70">
                    <tr>
                      <th className="text-left py-2 pr-4">Student</th>
                      <th className="text-left py-2 pr-4">Email</th>
                      <th className="text-left py-2 pr-4">Messages</th>
                      <th className="text-left py-2 pr-4">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {engRows.length === 0 ? (
                      <tr><td className="py-3 text-white/60" colSpan={4}>No students.</td></tr>
                    ) : (
                      engRows.map((r) => (
                        <tr key={r.id} className={`cursor-pointer ${selectedStudentId===r.id?"bg-white/10":""}`} onClick={() => { setSelectedStudentId(r.id); fetchStudent(r.id); }}>
                          <td className="py-2 pr-4">{r.name}</td>
                          <td className="py-2 pr-4">{r.email}</td>
                          <td className="py-2 pr-4">{r.messages}</td>
                          <td className="py-2 pr-4">{r.lastActiveAt ? new Date(r.lastActiveAt).toLocaleString() : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="rounded-2xl border border-white/15 bg-black/30 p-4 space-y-3">
                {!selectedStudentId ? (
                  <div className="text-white/60 text-sm">Select a student to view and edit details.</div>
                ) : !selectedStudent ? (
                  <div className="text-white/60 text-sm">Loading student…</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2 md:col-span-2">
                      <label className="block text-xs text-white/60">Email</label>
                      <input value={selectedStudent.email} disabled className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/70 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-white/60">Name</label>
                      <input value={selectedStudent.name || ""} onChange={(e) => setSelectedStudent({ ...(selectedStudent as any), name: e.target.value })} className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-white/60">Nickname</label>
                      <input value={selectedStudent.nickname || ""} onChange={(e) => setSelectedStudent({ ...(selectedStudent as any), nickname: e.target.value })} className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-white/60">Schedule</label>
                      <input value={selectedStudent.schedule || ""} onChange={(e) => setSelectedStudent({ ...(selectedStudent as any), schedule: e.target.value })} className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-white/60">Avatar URL</label>
                      <input value={selectedStudent.avatarUrl || ""} onChange={(e) => setSelectedStudent({ ...(selectedStudent as any), avatarUrl: e.target.value })} className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs text-white/60">Section</label>
                      <input value={`${selectedStudent.yearLevel || "-"} ${selectedStudent.block || "-"}`} disabled className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/70 outline-none" />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <button disabled={savingStudent} onClick={saveStudent} className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 px-3 py-2 text-sm">{savingStudent ? "Saving…" : "Save changes"}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {tab === "engagement" && (
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-lg p-4 space-y-3">
            {!hasSection && subjects.length === 0 && engRows.length === 0 && (
              <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 text-yellow-200 px-3 py-2 text-sm">
                No section or subjects assigned to your account. Go to <a href="/teacher/sections" className="underline">Sections & Subjects</a> to configure your groups.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => setEngView("section")} className={`rounded-full px-3 py-1 border ${engView === "section" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Section</button>
              <button onClick={() => setEngView("subject")} className={`rounded-full px-3 py-1 border ${engView === "subject" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}>Subject</button>
              <div className="ml-auto flex gap-2">
                <select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="rounded-lg bg-black/30 border border-white/20 px-2 py-1 text-xs">
                  <option value="24h">24h</option>
                  <option value="7d">7d</option>
                  <option value="30d">30d</option>
                </select>
                {engView === "subject" && (
                  <select value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} className="rounded-lg bg-black/30 border border-white/20 px-2 py-1 text-xs">
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.id}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="text-xs text-white/70">Students: {engRows.length}</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-white/70">
                  <tr>
                    <th className="text-left py-2 pr-4">Student</th>
                    <th className="text-left py-2 pr-4">Email</th>
                    <th className="text-left py-2 pr-4">ID</th>
                    <th className="text-left py-2 pr-4">Messages</th>
                    <th className="text-left py-2 pr-4">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {engRows.length === 0 ? (
                    <tr><td className="py-3 text-white/60" colSpan={5}>No data.</td></tr>
                  ) : (
                    engRows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-4">{r.name}</td>
                        <td className="py-2 pr-4">{r.email}</td>
                        <td className="py-2 pr-4">{r.studentId || "-"}</td>
                        <td className="py-2 pr-4">{r.messages}</td>
                        <td className="py-2 pr-4">{r.lastActiveAt ? new Date(r.lastActiveAt).toLocaleString() : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {tab === "logs" && (
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
                    <div className="text-[11px] text-white/50 flex items-center gap-2">
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                      {(log.actorName || log.actorId) && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-300">
                          {log.actorName || log.actorId}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const d: any = log.data as any;
                      const channelName = d && typeof d === 'object' ? (d.channelName || null) : null;
                      const channelTopic = d && typeof d === 'object' ? (d.channelTopic || null) : null;
                      const subj = [log.subjectType, log.subjectId].filter(Boolean).join(":");
                      if (channelName || channelTopic || subj) {
                        return (
                          <div className="mt-1 text-[11px] text-white/60">
                            {channelName ? `${channelName}` : ''}
                            {subj ? `${channelName ? ' ' : ''}(${subj})` : ''}
                            {channelTopic ? ` — ${channelTopic}` : ''}
                          </div>
                        );
                      }
                      return null;
                    })()}
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
          )}
        </div>
      </div>
    </div>
  );
}
