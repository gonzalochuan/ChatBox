"use client";

import Link from "next/link";
import SparkleGridOverlay from "@/components/SparkleGridOverlay";
import { useState } from "react";
import { SERVER_URL } from "@/lib/config";
import { setToken } from "@/lib/auth";
import AlertBanner from "@/components/AlertBanner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="relative min-h-[100dvh] text-white bg-black overflow-hidden">
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
      <div className="absolute top-6 left-6 z-30 text-xs md:text-sm tracking-widest text-white/80 font-ethno-bold">CB</div>
      <Link href="/" className="absolute top-6 right-6 z-30 text-xs md:text-sm tracking-wider text-white/80 hover:text-white">Back</Link>

      {/* Centered form card */}
      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 pt-24 sm:pt-28">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_10px_40px_-10px_rgba(0,0,0,0.6)] p-6 sm:p-8">
          <h1 className="text-2xl font-akira-bold tracking-wide">Sign in</h1>
          <p className="text-sm text-white/70 mt-4">Welcome to ChatBox</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30"
                placeholder="name@school.edu"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/30"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full border border-white/25 bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-md py-3 font-medium tracking-wide transition-colors disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-5 text-sm text-white/70 flex items-center justify-between">
            <Link href="/register" className="hover:text-white">Create account</Link>
            <Link href="/chat" className="hover:text-white">Continue as guest</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
