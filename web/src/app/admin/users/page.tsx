"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@/store/useConnection";
import { getToken } from "@/lib/auth";
import { SERVER_URL } from "@/lib/config";
import PasswordInput from "@/components/PasswordInput";
import AvatarPicker from "@/components/AvatarPicker";
import PrimaryButton from "@/components/PrimaryButton";

const YEAR_OPTIONS = ["1", "2", "3", "4"];

interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  nickname?: string | null;
  studentId?: string | null;
  yearLevel?: string | null;
  block?: string | null;
  schedule?: string | null;
  avatarUrl?: string | null;
  createdAt: string | Date;
  roles: string[];
  subjects: string[];
  profession?: string | null;
}

function AddStaffModal({ onClose, onDone, baseUrl }: { onClose: () => void; onDone: () => void; baseUrl: string; }) {
  const [primaryRole, setPrimaryRole] = useState<"ADMIN" | "TEACHER">("ADMIN");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profession, setProfession] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Array<{ id: string; yearLevel: string; block: string; subjects: string[] }>>([
    { id: Math.random().toString(36).slice(2), yearLevel: "1", block: "", subjects: [] },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!name.trim()) throw new Error("Name is required");
      if (!email.trim()) throw new Error("Email is required");
      if (!password.trim()) throw new Error("Password is required");
      if (primaryRole === "TEACHER") {
        if (!profession.trim()) throw new Error("Profession is required for teachers");
        const valid = assignments.filter((a) => a.yearLevel && a.block.trim() && a.subjects.length > 0);
        if (valid.length === 0) throw new Error("Add at least one section assignment with subjects");
      }
      const api = baseUrl.replace(/\/$/, "");
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${api}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          password,
          name,
          avatarUrl: primaryRole === "TEACHER" ? avatarUrl : undefined,
          primaryRole,
          profession: primaryRole === "TEACHER" ? profession.trim() : undefined,
          // Multiple section assignments for teachers
          sectionAssignments: primaryRole === "TEACHER"
            ? assignments
                .filter((a) => a.yearLevel && a.block.trim() && a.subjects.length > 0)
                .map((a) => ({ yearLevel: a.yearLevel, block: a.block.trim(), subjectCodes: a.subjects }))
            : undefined,
        }),
      });
      if (!res.ok) throw new Error(`create_failed_${res.status}`);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add Admin/Teacher"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
          <PrimaryButton disabled={saving} onClick={submit}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </>
      }
    >
      {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-white/60">Role</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPrimaryRole("ADMIN")}
              className={`rounded-full px-3 py-1 text-xs border ${primaryRole === "ADMIN" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setPrimaryRole("TEACHER")}
              className={`rounded-full px-3 py-1 text-xs border ${primaryRole === "TEACHER" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}
            >
              Teacher
            </button>
          </div>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <PasswordInput value={password} onChange={setPassword} placeholder="Password" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        {primaryRole === "TEACHER" && (
          <>
            <AvatarPicker value={avatarUrl} onChange={setAvatarUrl} />
            <input value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="Profession" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
            <div className="space-y-3">
              {assignments.map((a, idx) => (
                <AssignmentRow
                  key={a.id}
                  index={idx}
                  value={a}
                  onChange={(val) => {
                    setAssignments((prev) => prev.map((x) => (x.id === a.id ? val : x)));
                  }}
                  onRemove={() => setAssignments((prev) => prev.filter((x) => x.id !== a.id))}
                />
              ))}
              <button
                type="button"
                onClick={() => setAssignments((prev) => [...prev, { id: Math.random().toString(36).slice(2), yearLevel: "1", block: "", subjects: [] }])}
                className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs"
              >
                Add Section Assignment
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function AdminUsersPage() {
  const { baseUrl } = useConnection();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "TEACHER" | "STUDENT">("ALL");
  const roleMenuRef = useRef<HTMLDivElement | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showEdit, setShowEdit] = useState<AdminUser | null>(null);
  const [showRoles, setShowRoles] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as any;
      if (roleMenuRef.current && !roleMenuRef.current.contains(t)) setRoleOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const roles = Array.isArray(u.roles) ? u.roles : [];
      if (roleFilter !== "ALL" && !roles.includes(roleFilter)) return false;
      if (!q) return true;
      const hay = `${u.name || ""} ${u.nickname || ""} ${u.email || ""} ${u.studentId || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, query, roleFilter]);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const api = (baseUrl || SERVER_URL).replace(/\/$/, "");
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${api}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`list_failed_${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

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
            <div className="font-ethno-bold tracking-widest text-sm md:text-base">USERS & ROLES</div>
          </div>
          <div className="text-xs text-white/70">Mode: {baseUrl ? "CUSTOM" : "SERVER"}</div>
        </header>

        <div className="p-3 md:p-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3 md:gap-4 min-h-0">
          <aside className="rounded-2xl border border-white/15 bg-black/40 backdrop-blur-sm p-3 md:p-4 h-fit lg:sticky lg:top-[76px]">
            <div className="text-xs uppercase tracking-widest text-white/60">Actions</div>
            <div className="mt-3 grid gap-2">
              <PrimaryButton onClick={() => setShowAddStudent(true)} fullWidth className="px-3 py-1.5 text-[12px] font-medium">
                Add Student
              </PrimaryButton>
              <PrimaryButton onClick={() => setShowAddStaff(true)} fullWidth className="px-3 py-1.5 text-[12px] font-medium">
                Add Admins/Teacher
              </PrimaryButton>
              <PrimaryButton onClick={() => setShowImport(true)} fullWidth className="px-3 py-1.5 text-[12px] font-medium">
                Import
              </PrimaryButton>
              <PrimaryButton onClick={load} fullWidth className="px-3 py-1.5 text-[12px] font-medium">
                Refresh
              </PrimaryButton>
            </div>
          </aside>

          <div className="min-h-0">
            {error && (
              <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-white/15 bg-black/40 backdrop-blur-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 text-sm text-white/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>Total: {users.length}</div>
                  <div className="text-white/50">Showing: {filteredUsers.length}</div>
                </div>
              </div>

              <div className="px-3 py-2 border-b border-white/10 bg-black/30">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search name, email, student ID…"
                      className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-sm"
                        aria-label="Clear search"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest text-white/50">Role</span>
                    <div className="relative" ref={roleMenuRef}>
                      <button
                        type="button"
                        onClick={() => setRoleOpen((v) => !v)}
                        className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:ring-2 focus:ring-white/30 flex items-center justify-between min-w-[150px]"
                      >
                        <span>
                          {roleFilter === "ALL" ? "All" : roleFilter === "STUDENT" ? "Student" : roleFilter === "TEACHER" ? "Teacher" : "Admin"}
                        </span>
                        <span className="text-white/60">▾</span>
                      </button>
                      {roleOpen && (
                        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/15 bg-black/40 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                          {([
                            { value: "ALL", label: "All" },
                            { value: "STUDENT", label: "Student" },
                            { value: "TEACHER", label: "Teacher" },
                            { value: "ADMIN", label: "Admin" },
                          ] as const).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setRoleFilter(opt.value);
                                setRoleOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 text-left text-sm hover:bg-white/5 ${roleFilter === opt.value ? "bg-white/10" : ""}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="max-h-[calc(100dvh-180px)] md:max-h-[calc(100dvh-180px)] overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-white/60 text-sm">Loading…</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-white/60 text-sm">No users found.</div>
                ) : (
                  <UserList
                    users={filteredUsers}
                    onEdit={setShowEdit}
                    onRoles={setShowRoles}
                    onDelete={setConfirmDelete}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddStudent && <AddStudentModal onClose={() => setShowAddStudent(false)} onDone={() => { setShowAddStudent(false); load(); }} baseUrl={baseUrl || SERVER_URL} />}
      {showAddStaff && <AddStaffModal onClose={() => setShowAddStaff(false)} onDone={() => { setShowAddStaff(false); load(); }} baseUrl={baseUrl || SERVER_URL} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} baseUrl={baseUrl || SERVER_URL} />}
      {showEdit && <EditUserModal user={showEdit} onClose={() => setShowEdit(null)} onDone={() => { setShowEdit(null); load(); }} baseUrl={baseUrl || SERVER_URL} />}
      {showRoles && <RolesModal user={showRoles} onClose={() => setShowRoles(null)} onDone={() => { setShowRoles(null); load(); }} baseUrl={baseUrl || SERVER_URL} />}
      {confirmDelete && <DeleteUserModal user={confirmDelete} onClose={() => setConfirmDelete(null)} onDone={() => { setConfirmDelete(null); load(); }} baseUrl={baseUrl || SERVER_URL} />}
    </div>
  );
}

function ImportModal({ onClose, onDone, baseUrl }: { onClose: () => void; onDone: () => void; baseUrl: string; }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; failed: number; errors?: string[] } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) throw new Error("File must contain at least a header row and one data row");
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['email', 'role'];
    const missing = requiredHeaders.filter(h => !headers.includes(h));
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);
    const parsed = lines.slice(1).map((line, idx) => {
      const values = line.split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      row._line = idx + 2;
      return row;
    });
    return parsed;
  };

  const parseFile = async () => {
    if (!file) return;
    setParsing(true);
    setErrors([]);
    setRows([]);
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();
      let parsed: any[] = [];
      if (ext === 'csv') {
        parsed = parseCSV(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        // TODO: integrate xlsx library for Excel parsing
        throw new Error('Excel parsing not yet supported. Please save as CSV.');
      } else {
        throw new Error('Unsupported file type. Use CSV or Excel.');
      }
      // Basic validation
      const errs: string[] = [];
      parsed.forEach((row, i) => {
        if (!row.email) errs.push(`Row ${row._line}: Email is required`);
        if (!row.role) errs.push(`Row ${row._line}: Role is required`);
        if (row.role && !['student', 'teacher', 'admin'].includes(row.role.toLowerCase())) {
          errs.push(`Row ${row._line}: Role must be one of: student, teacher, admin`);
        }
      });
      if (errs.length) {
        setErrors(errs);
      } else {
        setRows(parsed);
      }
    } catch (e: any) {
      setErrors([e.message || 'Failed to parse file']);
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const api = baseUrl.replace(/\/$/, '');
      const token = getToken();
      if (!token) throw new Error('No auth token');
      const res = await fetch(`${api}/admin/users/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ users: rows }),
      });
      if (!res.ok) throw new Error(`Import failed: ${res.status}`);
      const result = await res.json();
      setImportResult(result);
      if (result.created > 0) {
        setTimeout(() => onDone(), 1200);
      }
    } catch (e: any) {
      setErrors([e.message || 'Import failed']);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal title="Import Users (CSV/Excel)" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
        {rows.length > 0 && !importResult && (
          <PrimaryButton disabled={importing} onClick={doImport}>
            {importing ? 'Importing…' : `Import ${rows.length} rows`}
          </PrimaryButton>
        )}
      </>
    }>
      {errors.length > 0 && (
        <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {importResult && (
        <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 px-3 py-2 text-sm">
          <div>✅ Created: {importResult.created}</div>
          {importResult.failed > 0 && <div>❌ Failed: {importResult.failed}</div>}
          {importResult.errors?.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {!importResult && (
        <div className="space-y-3">
          <div className="text-xs text-white/60">
            <div className="font-semibold mb-1">Required columns:</div>
            <div>email, role</div>
            <div className="font-semibold mb-1 mt-2">Optional columns:</div>
            <div>password, name, nickname, studentId, year, block, schedule, subjectCodes (comma-separated, e.g., IT-1234,CS-101), instructor (for instructors only), avatarUrl</div>
            <div className="font-semibold mb-1 mt-2">Role values:</div>
            <div>student, teacher, admin</div>
            <div className="mt-2">
              <a
                href="data:text/csv;charset=utf-8,email%2Crole%2Cpassword%2Cname%2Cnickname%2CstudentId%2Cyear%2Cblock%2Cschedule%2CsubjectCodes%2Cinstructor%0Astudent1%40school.edu%2Cstudent%2CTemp123A%2CJuan%20Dela%20Cruz%2Cjuanc%2C20230001%2C1%2CA%2CMon%209-11%2CIT-1234%2CCS-101%2C%0Ateacher1%40school.edu%2Cteacher%2CTemp123A%2CMaria%20Santos%2C%2C%2C%2C%2C%2C%2C%2C%2CPhysics"
                download="bulk-import-template.csv"
                className="inline-block underline text-emerald-300 hover:text-emerald-200"
              >
                Download CSV template
              </a>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Upload CSV/Excel</label>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="block w-full text-sm text-black file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-black hover:file:bg-white/20" />
          </div>
          {file && !rows.length && (
            <PrimaryButton disabled={parsing} onClick={parseFile}>
              {parsing ? 'Parsing…' : 'Parse & Preview'}
            </PrimaryButton>
          )}
          {rows.length > 0 && (
            <div className="max-h-[300px] overflow-auto rounded-xl border border-white/15 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-widest text-white/60 mb-2">Preview (first 5 rows)</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40">
                    <th className="text-left p-1">Email</th>
                    <th className="text-left p-1">Role</th>
                    <th className="text-left p-1">Name</th>
                    <th className="text-left p-1">Student ID</th>
                    <th className="text-left p-1">Year</th>
                    <th className="text-left p-1">Block</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      <td className="p-1">{row.email || ''}</td>
                      <td className="p-1">{row.role || ''}</td>
                      <td className="p-1">{row.name || ''}</td>
                      <td className="p-1">{row.studentid || ''}</td>
                      <td className="p-1">{row.year || ''}</td>
                      <td className="p-1">{row.block || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && <div className="text-xs text-white/40 mt-2">…and {rows.length - 5} more rows</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function useSubjectChips(initial: string[]) {
  const [value, setValue] = useState<string[]>(initial);
  const [input, setInput] = useState("");
  const add = (raw: string) => {
    const cleaned = raw.trim().toUpperCase();
    if (!cleaned) return;
    setValue((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]));
    setInput("");
  };
  const remove = (code: string) => setValue((prev) => prev.filter((c) => c !== code));
  return { value, input, setInput, add, remove, setValue };
}

function SubjectChips({ chips }: { chips: ReturnType<typeof useSubjectChips> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2.5">
      {chips.value.map((code) => (
        <span key={code} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm">
          {code}
          <button type="button" aria-label={`Remove ${code}`} className="text-white/70 hover:text-white" onClick={() => chips.remove(code)}>
            ×
          </button>
        </span>
      ))}
      <input
        value={chips.input}
        onChange={(e) => chips.setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            chips.add(chips.input);
          } else if (e.key === "Backspace" && !chips.input && chips.value.length) {
            chips.remove(chips.value[chips.value.length - 1]);
          }
        }}
        placeholder="Add code e.g., CS101"
        className="flex-1 min-w-[140px] bg-transparent text-white placeholder-white/40 outline-none"
      />
    </div>
  );
}

function YearLevelSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (val: string) => void;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-white/60">Year Level <span className="text-red-400">*</span></label>
      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full rounded-xl border ${error ? "border-red-400/60" : "border-white/20"} bg-white/5 px-3 py-2.5 text-left text-[color:var(--foreground)]/80 outline-none focus:ring-2 focus:ring-white/30 flex items-center justify-between`}
        >
          <span>{value ? `Year ${value}` : "Select year"}</span>
          <span className="text-[color:var(--foreground)]/50">▾</span>
        </button>
        {open && (
          <div className="absolute z-40 mt-2 w-full rounded-xl border border-white/20 bg-black/40 backdrop-blur-xl shadow-xl overflow-hidden">
            {YEAR_OPTIONS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  onChange(y);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-[color:var(--foreground)]/40 hover:bg-white/10 ${value === y ? "bg-white/10" : ""}`}
              >
                Year {y}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400/90">{error}</p>}
    </div>
  );
}

function AssignmentRow({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number;
  value: { id: string; yearLevel: string; block: string; subjects: string[] };
  onChange: (val: { id: string; yearLevel: string; block: string; subjects: string[] }) => void;
  onRemove: () => void;
}) {
  const chips = useSubjectChips(value.subjects || []);
  useEffect(() => {
    onChange({ ...value, subjects: chips.value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips.value]);
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-widest text-white/60">Assignment #{index + 1}</div>
        <button type="button" onClick={onRemove} className="text-xs rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-1">Remove</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <YearLevelSelect value={value.yearLevel} onChange={(v) => onChange({ ...value, yearLevel: v })} />
        <div>
          <label className="block text-xs uppercase tracking-widest text-white/60">Block <span className="text-red-400">*</span></label>
          <input
            value={value.block}
            onChange={(e) => onChange({ ...value, block: e.target.value })}
            placeholder="Block"
            className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-white/60">Subject Codes <span className="text-red-400">*</span></label>
          <SubjectChips chips={chips} />
        </div>
      </div>
    </div>
  );
}

function UserList({
  users,
  onEdit,
  onRoles,
  onDelete,
}: {
  users: AdminUser[];
  onEdit: (user: AdminUser) => void;
  onRoles: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, AdminUser[]>();
    users.forEach((user) => {
      const key = `${user.yearLevel || ""}::${user.block || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(user);
    });
    return Array.from(map.entries()).map(([key, list]) => {
      const [year, block] = key.split("::");
      return { key, year: year || "—", block: block || "—", users: list };
    });
  }, [users]);

  return (
    <div className="divide-y divide-white/10">
      {grouped.map((group) => (
        <div key={group.key}>
          <div className="px-3 py-2 text-xs uppercase tracking-widest text-white/50 bg-white/5">Year {group.year} • Block {group.block}</div>
          {group.users.map((u) => {
            const isStudent = u.roles.includes("STUDENT");
            return (
              <div key={u.id} className="p-3 md:p-4 grid grid-cols-12 gap-3 items-center">
                <div className="col-span-12 md:col-span-3">
                  <div className="font-medium truncate">{u.name || u.nickname || u.email}</div>
                  <div className="text-xs text-white/60 truncate">{u.email}</div>
                  {isStudent ? (
                    <div className="text-[11px] text-white/50 truncate">Student ID: {u.studentId || "—"}</div>
                  ) : (
                    <div className="text-[11px] text-white/50 truncate">
                      {u.roles.includes("TEACHER")
                        ? `Teacher${u.profession ? ` • ${u.profession}` : ""}`
                        : "Admin"}
                    </div>
                  )}
                </div>

                <div className="col-span-12 md:col-span-3 text-xs text-white/70 space-y-1">
                  {isStudent ? (
                    <>
                      <div>Subjects:</div>
                      <div className="flex flex-wrap gap-1">
                        {u.subjects.length === 0 ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/20 text-white/60">(none)</span>
                        ) : (
                          u.subjects.map((code) => (
                            <span key={code} className="text-[11px] px-2 py-0.5 rounded-full border border-white/20 text-white/80">
                              {code}
                            </span>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="text-white/60">Profession</div>
                      <div className="text-[11px] text-white/70">
                        {u.roles.includes("TEACHER") ? (u.profession || "—") : "Staff"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-12 md:col-span-2 text-xs text-white/70 truncate">
                  {isStudent ? (
                    <>
                      <div className="text-white/60">Schedule</div>
                      <div className="line-clamp-3 whitespace-pre-wrap">{u.schedule || "—"}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-white/60">Roles</div>
                      <div className="text-[11px] text-white/70">{u.roles.join(", ") || "—"}</div>
                    </>
                  )}
                </div>

                <div className="col-span-12 md:col-span-2 flex flex-wrap gap-1">
                  {u.roles.length === 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/20 text-white/70">(no role)</span>
                  )}
                  {u.roles.map((r) => (
                    <span key={r} className="text-[11px] px-2 py-0.5 rounded-full border border-white/20 text-white/80">
                      {r}
                    </span>
                  ))}
                </div>

                <div className="col-span-12 md:col-span-2 flex gap-2 justify-start md:justify-end">
                  <button onClick={() => onEdit(u)} className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs px-2 py-1">Edit</button>
                  <button onClick={() => onRoles(u)} className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs px-2 py-1">Roles</button>
                  <button onClick={() => onDelete(u)} className="rounded-lg border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 text-xs px-2 py-1">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AddStudentModal({ onClose, onDone, baseUrl }: { onClose: () => void; onDone: () => void; baseUrl: string; }) {
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState("");
  const [yearLevel, setYearLevel] = useState("1");
  const [block, setBlock] = useState("");
  const [schedule, setSchedule] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const subjectChips = useSubjectChips([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!subjectChips.value.length) throw new Error("At least one subject code is required");
      if (!block.trim()) throw new Error("Block is required");
      if (!studentId.trim()) throw new Error("Student ID is required");
      if (!schedule.trim()) throw new Error("Schedules are required");
      const api = baseUrl.replace(/\/$/, "");
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${api}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          password,
          name,
          nickname,
          studentId,
          subjectCodes: subjectChips.value,
          yearLevel,
          block,
          schedule,
          avatarUrl,
          primaryRole: "STUDENT",
        }),
      });
      if (!res.ok) throw new Error(`create_failed_${res.status}`);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Student" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
        <PrimaryButton disabled={saving} onClick={submit}>
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </>
    }>
      {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
      <div className="space-y-3">
        <AvatarPicker value={avatarUrl} onChange={setAvatarUrl} className="" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <PasswordInput value={password} onChange={setPassword} placeholder="Password" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <YearLevelSelect value={yearLevel} onChange={setYearLevel} />
        <input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Block" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
        <div>
          <label className="block text-xs uppercase tracking-widest text-white/60">Subject Codes <span className="text-red-400">*</span></label>
          <SubjectChips chips={subjectChips} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-white/60">Schedules <span className="text-red-400">*</span></label>
          <textarea value={schedule} onChange={(e) => setSchedule(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" placeholder="Paste timetable" />
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onDone, baseUrl }: { user: AdminUser; onClose: () => void; onDone: () => void; baseUrl: string; }) {
  const initialRole: "ADMIN" | "TEACHER" | "STUDENT" = user.roles.includes("TEACHER")
    ? "TEACHER"
    : user.roles.includes("STUDENT")
    ? "STUDENT"
    : "ADMIN";
  const [primaryRole, setPrimaryRole] = useState<"ADMIN" | "TEACHER" | "STUDENT">(initialRole);
  const isStudent = primaryRole === "STUDENT";
  const [name, setName] = useState(user.name || "");
  const [nickname, setNickname] = useState(user.nickname || "");
  const [studentId, setStudentId] = useState(user.studentId || "");
  const [password, setPassword] = useState("");
  const [yearLevel, setYearLevel] = useState(user.yearLevel || "1");
  const [block, setBlock] = useState(user.block || "");
  const [schedule, setSchedule] = useState(user.schedule || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl || null);
  const [professionState, setProfessionState] = useState(user.profession || "");
  const subjectChips = useSubjectChips(user.subjects || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!name.trim()) throw new Error("Name is required");
      if (!isStudent && primaryRole === "TEACHER" && !professionState.trim()) {
        throw new Error("Profession is required for teachers");
      }
      const api = baseUrl.replace(/\/$/, "");
      const token = getToken();
      if (!token) throw new Error("no_token");
      const payload: any = {
        name,
        password: password || undefined,
        primaryRole,
      };
      if (isStudent) {
        payload.nickname = nickname;
        payload.studentId = studentId;
        payload.subjectCodes = subjectChips.value;
        payload.yearLevel = yearLevel;
        payload.block = block;
        payload.schedule = schedule;
        payload.avatarUrl = avatarUrl;
      } else {
        payload.profession = primaryRole === "TEACHER" ? professionState : null;
        if (primaryRole === "TEACHER") {
          payload.avatarUrl = avatarUrl;
        }
      }
      const res = await fetch(`${api}/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`update_failed_${res.status}`);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isStudent ? "Edit Student" : "Edit Admin/Teacher"}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
          <PrimaryButton disabled={saving} onClick={submit}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </>
      }
    >
      {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
      {isStudent ? (
        <div className="space-y-3">
          <AvatarPicker value={avatarUrl} onChange={setAvatarUrl} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          <input value={user.email} disabled className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/70 outline-none" />
          <PasswordInput value={password} onChange={setPassword} placeholder="New password (optional)" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          <YearLevelSelect value={yearLevel || "1"} onChange={setYearLevel} />
          <input value={block || ""} onChange={(e) => setBlock(e.target.value)} placeholder="Block" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/60">Subject Codes <span className="text-red-400">*</span></label>
            <SubjectChips chips={subjectChips} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/60">Schedules</label>
            <textarea value={schedule} onChange={(e) => setSchedule(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" placeholder="Paste timetable" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-white/60">Role</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPrimaryRole("ADMIN")}
                className={`rounded-full px-3 py-1 text-xs border ${primaryRole === "ADMIN" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setPrimaryRole("TEACHER")}
                className={`rounded-full px-3 py-1 text-xs border ${primaryRole === "TEACHER" ? "border-white/60 bg-white/10" : "border-white/20 bg-white/5"}`}
              >
                Teacher
              </button>
            </div>
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          <input value={user.email} disabled className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/70 outline-none" />
          <PasswordInput value={password} onChange={setPassword} placeholder="New password (optional)" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          {primaryRole === "TEACHER" && (
            <input value={professionState} onChange={(e) => setProfessionState(e.target.value)} placeholder="Profession" className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none" />
          )}
        </div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white">×</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar space-y-4">{children}</div>
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function RolesModal({ user, onClose, onDone, baseUrl }: { user: AdminUser; onClose: () => void; onDone: () => void; baseUrl: string; }) {
  const [roles, setRoles] = useState<string[]>(user.roles || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const apply = async () => {
    try {
      setSaving(true);
      setError(null);
      const api = baseUrl.replace(/\/$/, "");
      const token = getToken();
      if (!token) throw new Error("no_token");
      const desired = new Set(roles);
      const current = new Set(user.roles || []);
      for (const r of ["ADMIN", "TEACHER", "STUDENT"]) {
        if (desired.has(r) && !current.has(r)) {
          await fetch(`${api}/admin/users/${user.id}/roles`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: r }) });
        }
        if (!desired.has(r) && current.has(r)) {
          await fetch(`${api}/admin/users/${user.id}/roles`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: r }) });
        }
      }
      onDone();
    } catch (e: any) {
      setError(e?.message || "Failed to update roles");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4">
        <div className="text-lg font-semibold mb-3">Roles</div>
        {error && <div className="mb-2 text-sm text-red-300">{error}</div>}
        <div className="flex flex-col gap-2">
          {(["ADMIN", "TEACHER", "STUDENT"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
          <button disabled={saving} onClick={apply} className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 px-3 py-1.5">{saving ? "Saving…" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}

function DeleteUserModal({ user, onClose, onDone, baseUrl }: { user: AdminUser; onClose: () => void; onDone: () => void; baseUrl: string; }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      const api = baseUrl.replace(/\/$/, "");
      const token = getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`${api}/admin/users/${user.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`delete_failed_${res.status}`);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Failed to delete user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4">
        <div className="text-lg font-semibold mb-2">Delete User</div>
        <div className="text-white/80 text-sm">Are you sure you want to delete <span className="font-semibold">{user.email}</span>?</div>
        {error && <div className="mt-2 text-sm text-red-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5">Cancel</button>
          <button disabled={saving} onClick={submit} className="rounded-xl border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5">{saving ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}
