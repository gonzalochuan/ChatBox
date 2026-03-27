"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import SparkleGridOverlay from "@/components/SparkleGridOverlay";
import { SERVER_URL } from "@/lib/config";
import AlertBanner from "@/components/AlertBanner";
import PasswordInput from "@/components/PasswordInput";
import PrimaryButton from "@/components/PrimaryButton";

export default function ClaimPage() {
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const normalizedEmail = email.trim();
    const normalizedStudentId = studentId.trim();
    const normalizedTemp = tempPassword;
    if (!normalizedEmail || !normalizedStudentId || !normalizedTemp.trim() || !newPassword.trim()) {
      setSubmitError("Email, Student ID, Temporary Password, and New Password are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${SERVER_URL}/auth/claim-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          studentId: normalizedStudentId,
          tempPassword: normalizedTemp,
          newPassword,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const code = data?.error;
        if (code === "account_not_found") throw new Error("Account not found. Make sure you are using the email that was imported by admin.");
        if (code === "studentId_mismatch") throw new Error("Student ID does not match the imported record.");
        if (code === "already_claimed") throw new Error("This account has already been claimed. Please sign in instead.");
        if (code === "invalid_temp_password") throw new Error("Temporary password is incorrect.");
        if (code === "password_must_include_uppercase_and_number_min6") throw new Error("Password must be at least 6 characters and include 1 uppercase letter and 1 number.");
        if (code === "email_studentId_tempPassword_newPassword_required") throw new Error("Please fill out all required fields.");
        throw new Error(code || `Claim failed (${resp.status})`);
      }

      try {
        if (data?.token) localStorage.setItem("token", String(data.token));
        if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
      } catch {
        // ignore
      }

      setSuccessMsg("Account claimed successfully. Redirecting to chat…");
      setTimeout(() => {
        window.location.href = "/chat";
      }, 800);
    } catch (err: any) {
      setSubmitError(err?.message || "Claim failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-theme relative min-h-[100dvh] text-[color:var(--foreground)] bg-[color:var(--background)] overflow-hidden">
      {submitError && <AlertBanner kind="error" message={submitError} />}
      {successMsg && <AlertBanner kind="success" message={successMsg} />}

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

      <div className="absolute top-6 left-6 z-30 flex items-center gap-2 text-xs md:text-sm tracking-widest text-slate-800/80 dark:text-white/80 font-ethno-bold">
        <span>CB ﾒ</span>
        <Image src="/seaitlogo.png" alt="SEAIT" width={48} height={48} className="h-[40px] w-auto" priority />
      </div>
      <Link href="/login" className="absolute top-6 right-6 z-30 text-xs md:text-sm tracking-wider text-slate-600 dark:text-white/80 hover:text-slate-900">Back</Link>

      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 pt-24 sm:pt-28">
        <div className="w-full max-w-xl rounded-2xl border border-gray-200/50 dark:border-white/5 bg-white dark:bg-[#1a1a1a] backdrop-blur-md shadow-xl dark:shadow-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-akira-bold text-slate-900 dark:text-white/95 tracking-wide">Claim account</h1>
          <p className="text-sm text-slate-500 dark:text-white/70 mt-4">Students are pre-imported by admin. Enter your imported email + Student ID to set your password.</p>

          <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="yourname@gmail.com"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">Student ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="2022-12345"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">Temporary password <span className="text-red-500">*</span></label>
              <PasswordInput
                required
                value={tempPassword}
                onChange={setTempPassword}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="(given by admin)"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">New password <span className="text-red-500">*</span></label>
              <PasswordInput
                required
                value={newPassword}
                onChange={setNewPassword}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="NewPass1"
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-white/50">Must include 1 uppercase + 1 number (min 6 chars).</p>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">Confirm password <span className="text-red-500">*</span></label>
              <PasswordInput
                required
                value={confirmPassword}
                onChange={setConfirmPassword}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="NewPass1"
              />
            </div>

            <div className="sm:col-span-2">
              <PrimaryButton type="submit" disabled={loading} fullWidth>
                {loading ? "Claiming…" : "Claim account"}
              </PrimaryButton>
            </div>
          </form>

          <div className="mt-5 text-sm text-slate-500 dark:text-white/70">
            Already claimed? <Link href="/login" className="text-orange-600 dark:text-white hover:underline font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
