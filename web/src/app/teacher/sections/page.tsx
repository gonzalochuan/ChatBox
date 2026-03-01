"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { SERVER_URL } from "@/lib/config";
import { useConnection } from "@/store/useConnection";
import { getToken } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";

interface SectionInfo {
  id: string;
  name: string;
  yearLevel: string | null;
  block: string | null;
  channelId: string | null;
  members: number;
}

interface SubjectInfo {
  id: string;
  name: string;
  channelId: string;
}

interface OverviewResponse {
  section: SectionInfo | null;
  subjects: SubjectInfo[];
  availableSubjects: { id: string; name: string }[];
}

type TeacherAssignmentMap = Record<string, string[]>; // block -> subjects

export default function TeacherSectionsPage() {
  const { baseUrl, mode } = useConnection();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [yearLevel, setYearLevel] = useState<string>("");
  const [block, setBlock] = useState<string>("");
  const [subjectCodes, setSubjectCodes] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; name: string; email: string; studentId: string | null }>>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addName, setAddName] = useState("");
  const [addNickname, setAddNickname] = useState("");
  const [addStudentId, setAddStudentId] = useState("");
  const [addSchedule, setAddSchedule] = useState("");
  const [adding, setAdding] = useState(false);
  const [addAvatarUrl, setAddAvatarUrl] = useState<string>("");
  const [addSubjects, setAddSubjects] = useState<string[]>([]);
  const [addSubjectInput, setAddSubjectInput] = useState<string>("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState<boolean>(false);
  const [addYearLevel, setAddYearLevel] = useState<string>("");
  const [addBlock, setAddBlock] = useState<string>("");

  const [addYearOpen, setAddYearOpen] = useState<boolean>(false);
  const [addBlockOpen, setAddBlockOpen] = useState<boolean>(false);
  const addYearMenuRef = useRef<HTMLDivElement | null>(null);
  const addBlockMenuRef = useRef<HTMLDivElement | null>(null);

  const [setupYear, setSetupYear] = useState<string>("");
  const [setupBlock, setSetupBlock] = useState<string>("");
  const [setupSubjects, setSetupSubjects] = useState<string[]>([]);
  const [setupSubjectInput, setSetupSubjectInput] = useState<string>("");
  const [settingUp, setSettingUp] = useState<boolean>(false);

  const apiBase = useMemo(() => (baseUrl || SERVER_URL).replace(/\/$/, ""), [baseUrl]);

  const syncStateFromOverview = useCallback((data: OverviewResponse) => {
    setOverview(data);
    setYearLevel(data.section?.yearLevel || "");
    setBlock(data.section?.block || "");
    setSubjectCodes(data.subjects.map((subject) => subject.id));
  }, []);

  const assignmentMap = useMemo<TeacherAssignmentMap>(() => {
    const map: TeacherAssignmentMap = {};
    const list = Array.isArray(overview?.subjects) ? overview!.subjects : [];
    for (const subj of list) {
      const channelId = String((subj as any)?.channelId || "");
      if (!channelId.startsWith("SEC-") || !channelId.includes("::")) continue;
      const sectionPart = channelId.split("::")[0] || "";
      const parts = sectionPart.split("-");
      const blockPart = parts.length >= 3 ? parts[2] : "";
      const blk = String(blockPart || "").trim().toUpperCase();
      const code = String(subj.id || "").trim().toUpperCase();
      if (!blk || !code) continue;
      map[blk] ||= [];
      if (!map[blk].includes(code)) map[blk].push(code);
    }
    for (const blk of Object.keys(map)) map[blk].sort();
    return map;
  }, [overview?.subjects]);

  const assignmentBlocks = useMemo(() => Object.keys(assignmentMap).sort(), [assignmentMap]);
  const assignmentYear = useMemo(() => {
    // Try to infer a single year from any section-subject channel.
    const list = Array.isArray(overview?.subjects) ? overview!.subjects : [];
    for (const subj of list) {
      const channelId = String((subj as any)?.channelId || "");
      if (!channelId.startsWith("SEC-") || !channelId.includes("::")) continue;
      const sectionPart = channelId.split("::")[0] || "";
      const parts = sectionPart.split("-");
      const yearPart = parts.length >= 3 ? parts[1] : "";
      const yl = String(yearPart || "").trim();
      if (yl) return yl;
    }
    return "";
  }, [overview?.subjects]);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(null);
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/sections`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`overview_${res.status}`);
      const data = (await res.json()) as OverviewResponse;
      syncStateFromOverview(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load sections overview");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, syncStateFromOverview]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const loadStudents = useCallback(async () => {
    try {
      setLoadingStudents(true);
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/students?scope=section&period=7d`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`students_${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.students) ? data.students : [];
      setStudents(list.map((s: any) => ({ id: s.id, name: s.name, email: s.email, studentId: s.studentId || null })));
    } catch (e: any) {
      // surface as status to avoid blocking UI
      setStatus(e?.message || "Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // Close Add Student dropdowns on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as any;
      if (addYearMenuRef.current && !addYearMenuRef.current.contains(t)) setAddYearOpen(false);
      if (addBlockMenuRef.current && !addBlockMenuRef.current.contains(t)) setAddBlockOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Load subject suggestions for the teacher's current section for the Add Student form
  useEffect(() => {
    const yl = (addYearLevel || assignmentYear || overview?.section?.yearLevel || yearLevel || "").trim();
    const bl = (addBlock || "").trim();
    let cancelled = false;
    (async () => {
      if (!yl || !bl) { setSuggested([]); return; }
      try {
        setSuggestLoading(true);
        const res = await fetch(`${apiBase}/public/section-subjects?yearLevel=${encodeURIComponent(yl)}&block=${encodeURIComponent(bl)}`);
        if (!res.ok) throw new Error("suggest_failed");
        const data = await res.json();
        if (!cancelled) setSuggested(Array.isArray(data?.subjects) ? data.subjects : []);
      } catch {
        if (!cancelled) setSuggested([]);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiBase, addYearLevel, addBlock, assignmentYear, overview?.section?.yearLevel, yearLevel]);

  // Initialize add form Year/Block defaults from current section once overview loads
  useEffect(() => {
    if (!addYearLevel && (assignmentYear || overview?.section?.yearLevel || yearLevel)) {
      setAddYearLevel(assignmentYear || overview?.section?.yearLevel || yearLevel);
    }
    if (!addBlock) {
      if (assignmentBlocks.length > 0) {
        setAddBlock(assignmentBlocks[0]);
      } else if (overview?.section?.block || block) {
        setAddBlock(overview?.section?.block || block);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentYear, assignmentBlocks, overview?.section?.yearLevel, overview?.section?.block, yearLevel, block]);

  const handleAddSubject = (code?: string) => {
    const raw = typeof code === "string" ? code : newSubject;
    const normalized = raw.trim().toUpperCase();
    if (!normalized) return;
    if (subjectCodes.includes(normalized)) {
      setNewSubject("");
      return;
    }
    setSubjectCodes((prev) => [...prev, normalized]);
    setNewSubject("");
  };

  const handleRemoveSubject = (code: string) => {
    setSubjectCodes((prev) => prev.filter((subject) => subject !== code));
  };

  const handleSave = async () => {
    const trimmedYear = yearLevel.trim();
    const trimmedBlock = block.trim().toUpperCase();
    if (!trimmedYear || !trimmedBlock) {
      setError("Year level and block are required.");
      setStatus(null);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setStatus(null);
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${apiBase}/teacher/sections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          yearLevel: trimmedYear,
          block: trimmedBlock,
          subjects: subjectCodes,
        }),
      });
      if (!res.ok) throw new Error(`save_${res.status}`);
      const data = (await res.json()) as OverviewResponse;
      syncStateFromOverview(data);
      setStatus("Sections & subjects updated.");
    } catch (e: any) {
      setError(e?.message || "Failed to save changes");
      setStatus(null);
    } finally {
      setSaving(false);
    }
  };

  const availableSubjects = overview?.availableSubjects || [];
  const unusedSubjects = availableSubjects.filter((subject) => !subjectCodes.includes(subject.id));
  const currentSection = overview?.section;
  const hasAssignments = assignmentBlocks.length > 0;

  useEffect(() => {
    if (hasAssignments) return;
    if (!setupYear && (assignmentYear || yearLevel || overview?.section?.yearLevel)) {
      setSetupYear(assignmentYear || yearLevel || overview?.section?.yearLevel || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAssignments, assignmentYear, yearLevel, overview?.section?.yearLevel]);

  return (
    <div className="app-theme relative min-h-dvh text-white bg-black">
      <div className="grid-layer" />
      <div className="relative z-10 h-dvh grid grid-rows-[64px_1fr] min-h-0">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/teacher"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs md:text-sm text-white/80"
            >
              <span className="sr-only">Back to Teacher dashboard</span>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">SECTIONS &amp; SUBJECTS</div>
          </div>
          <div className="text-xs text-white/70">Mode: {mode.toUpperCase()}</div>
        </header>

        <div className="p-3 sm:p-4 space-y-4 overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          )}
          {status && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{status}</div>
          )}

          

          <section className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-3 sm:gap-4">
            <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4 flex flex-col gap-4">
              <div className="text-[10px] uppercase tracking-[0.35em] text-white/50">Student Management</div>
              <div className="text-sm text-white/70">Add students to your section and remove incorrect/inactive accounts.</div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">Add Student</div>
                <div className="grid grid-cols-1 gap-2">
                  {/* Avatar upload */}
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 shrink-0 rounded-full border border-white/30 bg-white/10 overflow-hidden ring-1 ring-white/20">
                      {addAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={addAvatarUrl} alt="Avatar preview" className="h-full w-full object-cover rounded-full" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-white/50 text-xs">No</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-start">
                      <div className="text-[11px] text-white/50">Recommended: square image. Max 8MB.</div>
                      <label className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-md px-3 py-1.5 text-xs cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const max = 8 * 1024 * 1024;
                            if (file.size > max) { setError("Image too large. Max size is 8MB."); return; }
                            const localUrl = URL.createObjectURL(file);
                            setAddAvatarUrl(localUrl);
                            const form = new FormData();
                            form.append("avatar", file);
                            try {
                              const up = await fetch(`${apiBase}/upload/avatar`, { method: "POST", body: form });
                              if (!up.ok) throw new Error(`Upload failed (${up.status})`);
                              const data = await up.json();
                              if (data?.url) {
                                const absolute = `${apiBase}${data.url}`;
                                setAddAvatarUrl(absolute);
                                try { URL.revokeObjectURL(localUrl); } catch {}
                              }
                            } catch (err: any) {
                              setError(err?.message || "Upload failed. Please try again.");
                            }
                          }}
                        />
                        <span>Upload</span>
                      </label>
                    </div>
                  </div>
                  <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                  <PasswordInput value={addPassword} onChange={setAddPassword} placeholder="Temporary password" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                  <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Full name (optional)" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                  <input value={addNickname} onChange={(e) => setAddNickname(e.target.value)} placeholder="Nickname (optional)" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                  <input value={addStudentId} onChange={(e) => setAddStudentId(e.target.value)} placeholder="Student ID" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                  {/* Year/Block inputs + preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {assignmentYear ? (
                      <div className="relative" ref={addYearMenuRef}>
                        <button
                          type="button"
                          onClick={() => setAddYearOpen((v) => !v)}
                          className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-left text-white/90 outline-none focus:ring-2 focus:ring-white/30 flex items-center justify-between"
                        >
                          <span>Year {addYearLevel || assignmentYear}</span>
                          <span className="text-white/70">▾</span>
                        </button>
                        {addYearOpen && (
                          <div className="absolute z-40 mt-2 w-full rounded-xl border border-white/20 bg-black/60 backdrop-blur-xl shadow-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={() => { setAddYearLevel(assignmentYear); setAddYearOpen(false); }}
                              className={`w-full text-left px-3 py-2 hover:bg-white/10 ${(addYearLevel || assignmentYear) === assignmentYear ? "bg-white/10" : ""}`}
                            >
                              Year {assignmentYear}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <input value={addYearLevel} onChange={(e) => setAddYearLevel(e.target.value)} placeholder="Year Level (e.g., 1)" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                    )}

                    {assignmentBlocks.length > 0 ? (
                      <div className="relative" ref={addBlockMenuRef}>
                        <button
                          type="button"
                          onClick={() => setAddBlockOpen((v) => !v)}
                          className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-left text-white/90 outline-none focus:ring-2 focus:ring-white/30 flex items-center justify-between"
                        >
                          <span>{addBlock || assignmentBlocks[0]}</span>
                          <span className="text-white/70">▾</span>
                        </button>
                        {addBlockOpen && (
                          <div className="absolute z-40 mt-2 w-full rounded-xl border border-white/20 bg-black/60 backdrop-blur-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto custom-scroll">
                            {assignmentBlocks.map((b) => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => { setAddBlock(String(b || "").trim().toUpperCase()); setAddBlockOpen(false); }}
                                className={`w-full text-left px-3 py-2 hover:bg-white/10 ${String(addBlock || assignmentBlocks[0]).toUpperCase() === String(b).toUpperCase() ? "bg-white/10" : ""}`}
                              >
                                {b}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input value={addBlock} onChange={(e) => setAddBlock(e.target.value)} placeholder="Block (e.g., B1)" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                    )}
                  </div>
                  <div className="text-[11px] text-white/60">Section: {(addYearLevel && addBlock) ? `SEC-${addYearLevel}-${(addBlock||"").toUpperCase()}` : "—"}</div>
                  {/* Subject Codes chips with suggestions */}
                  <div>
                    <div className="text-[11px] text-white/60 mb-1">Subject Codes</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2">
                      {addSubjects.map((code, idx) => (
                        <span key={`${code}-${idx}`} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs">
                          {code}
                          <button type="button" className="text-white/70 hover:text-white" onClick={() => setAddSubjects(addSubjects.filter((_, i) => i !== idx))}>×</button>
                        </span>
                      ))}
                      <input
                        value={addSubjectInput}
                        onChange={(e) => setAddSubjectInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            const cleaned = addSubjectInput.trim().toUpperCase();
                            if (cleaned && !addSubjects.includes(cleaned)) setAddSubjects([...addSubjects, cleaned]);
                            setAddSubjectInput("");
                          } else if (e.key === "Backspace" && !addSubjectInput && addSubjects.length) {
                            setAddSubjects(addSubjects.slice(0, -1));
                          }
                        }}
                        placeholder="Add code e.g., IT-233, CS101"
                        className="flex-1 min-w-[160px] bg-transparent text-white placeholder-white/40 outline-none text-sm"
                      />
                    </div>
                    <div className="mt-2">
                      <div className="text-[11px] text-white/60 mb-1">Suggested for Section {overview?.section ? overview.section.id : (yearLevel && block ? `SEC-${yearLevel}-${(block||"").toUpperCase()}` : "—")}{suggestLoading ? " (loading…)" : ""}</div>
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
                                if (cleaned && !addSubjects.includes(cleaned)) setAddSubjects([...addSubjects, cleaned]);
                              }}
                              className="text-[11px] px-2 py-0.5 rounded-full border border-white/25 bg-white/10 hover:bg-white/15"
                            >
                              {code}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-white/50 mt-2">Select Year and Block then enter the student's subjects. We'll auto-join the subject channels.</div>
                  </div>
                  <textarea value={addSchedule} onChange={(e) => setAddSchedule(e.target.value)} rows={2} placeholder="Schedules (optional)" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={adding}
                      onClick={async () => {
                        try {
                          setAdding(true);
                          setError(null);
                          if (!addYearLevel.trim() || !addBlock.trim()) throw new Error("year_block_required");
                          if (!addEmail.trim() || !addPassword.trim() || !addStudentId.trim()) {
                            setStatus("Email, password, and student ID are required");
                            return;
                          }
                          if (addSubjects.length === 0) {
                            setStatus("Select at least one subject code");
                            return;
                          }
                          const token = getToken();
                          if (!token) throw new Error("no_token");
                          const res = await fetch(`${apiBase}/teacher/students`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({
                              email: addEmail,
                              password: addPassword,
                              name: addName || undefined,
                              nickname: addNickname || undefined,
                              studentId: addStudentId,
                              schedule: addSchedule || undefined,
                              avatarUrl: addAvatarUrl || undefined,
                              subjectCodes: addSubjects,
                              yearLevel: addYearLevel || undefined,
                              block: addBlock || undefined,
                            }),
                          });
                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            throw new Error(data?.error || `create_student_${res.status}`);
                          }
                          setStatus("Student added.");
                          setAddEmail(""); setAddPassword(""); setAddName(""); setAddNickname(""); setAddStudentId(""); setAddSchedule(""); setAddAvatarUrl(""); setAddSubjects([]); setAddSubjectInput("");
                          await loadStudents();
                        } catch (e: any) {
                          setError(e?.message || "Failed to add student");
                        } finally {
                          setAdding(false);
                        }
                      }}
                      className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
                    >
                      {adding ? "Adding…" : "Add Student"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4 flex flex-col gap-4">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">Current Students ({students.length})</div>
                {students.length === 0 ? (
                  <div className="text-white/60 text-sm">No students found in your section.</div>
                ) : (
                  <div className="max-h-[320px] overflow-y-auto divide-y divide-white/10">
                    {students.map((s) => (
                      <div key={s.id} className="py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{s.name}</div>
                          <div className="text-xs text-white/60 truncate">{s.email} {s.studentId ? `• ${s.studentId}` : ""}</div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const token = getToken();
                              if (!token) throw new Error("no_token");
                              const res = await fetch(`${apiBase}/teacher/students/${s.id}`, {
                                method: "DELETE",
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              if (!res.ok) throw new Error(`remove_student_${res.status}`);
                              setStatus("Student removed.");
                              await loadStudents();
                            } catch (e: any) {
                              setError(e?.message || "Failed to remove student");
                            }
                          }}
                          className="text-xs rounded-lg border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 px-2 py-1"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
