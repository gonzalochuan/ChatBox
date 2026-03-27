"use client";

import Image from "next/image";
import Link from "next/link";
import SparkleGridOverlay from "@/components/SparkleGridOverlay";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVER_URL } from "@/lib/config";
import { getToken, setToken } from "@/lib/auth";
import AlertBanner from "@/components/AlertBanner";
import PasswordInput from "@/components/PasswordInput";
import PrimaryButton from "@/components/PrimaryButton";
import { useAuth } from "@/store/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { userId, roles, setProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (userId && getToken()) {
      if (roles.includes("ADMIN")) router.replace("/admin");
      else if (roles.includes("TEACHER")) router.replace("/teacher");
      else router.replace("/chat");
    }
  }, [userId, roles, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(`${SERVER_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || `Login failed (${resp.status})`);
      }
      const data = await resp.json();
      if (!data?.token) throw new Error("invalid_response");
      setToken(data.token);
      const roles: string[] = Array.isArray(data?.user?.roles) ? data.user.roles : [];
      if (roles.includes("ADMIN")) {
        window.location.href = "/admin";
      } else if (roles.includes("TEACHER")) {
        window.location.href = "/teacher";
      } else {
        window.location.href = "/chat";
      }
    } catch (err: any) {
      setError(err?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-theme relative min-h-[100dvh] text-[color:var(--foreground)] bg-[color:var(--background)] overflow-hidden">
      {error && <AlertBanner kind="error" message={error} />}
      {/* Background layers */}
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

      {/* Top chrome to match Intro */}
      <div className="absolute top-6 left-6 z-30 flex items-center gap-2 text-xs md:text-sm tracking-widest text-slate-800/80 dark:text-white/80 font-ethno-bold">
        <span>CB ﾒ</span>
        <Image src="/seaitlogo.png" alt="SEAIT" width={48} height={48} className="h-[40px] w-auto" priority />
      </div>
      <Link href="/" className="absolute top-6 right-6 z-30 text-xs md:text-sm tracking-wider text-slate-600 dark:text-white/80 hover:text-slate-900">Back</Link>

      {/* Centered form card */}
      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 pt-24 sm:pt-28">
        <div className="w-full max-w-md rounded-2xl border border-gray-200/50 dark:border-white/5 bg-white dark:bg-[#1a1a1a] backdrop-blur-md shadow-xl dark:shadow-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-akira-bold text-slate-900 dark:text-white/95 tracking-wide">Sign in</h1>
          <p className="text-sm text-slate-500 dark:text-gray-300 mt-4">Welcome to ChatBox</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="name@school.edu"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-300 font-medium">Password</label>
              <PasswordInput
                required
                value={password}
                onChange={setPassword}
                className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#242526] px-3 py-2.5 text-slate-800 dark:!text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="••••••••"
              />
            </div>
            <PrimaryButton type="submit" disabled={loading} fullWidth>
              {loading ? "Signing in…" : "Sign in"}
            </PrimaryButton>
          </form>

          <div className="mt-5 text-sm flex items-center justify-between">
            <Link href="/claim" className="text-orange-600 dark:text-white/95 hover:underline font-medium">Claim account</Link>
            <Link href="/chat" className="text-slate-500 dark:text-white/95 hover:text-slate-700">Continue as guest</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
