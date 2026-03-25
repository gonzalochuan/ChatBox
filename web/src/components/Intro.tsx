"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PrimaryButton from "@/components/PrimaryButton";

export default function Intro() {
  const [leaving, setLeaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const router = useRouter();
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const sparkleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Lock page scroll while intro is shown so the overlay feels truly full-screen
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    if (isPlaying) {
      const p = v.play();
      if (p) p.catch(() => {
        // Autoplay might be blocked until user gesture; keep state in sync
        setIsPlaying(false);
      });
    } else {
      v.pause();
    }
  }, [isPlaying]);

  // Ensure we always start in the light, non-playing state
  useEffect(() => {
    setIsPlaying(false);
  }, []);

  // Sparkle canvas overlay: draw tiny stars at grid intersections
  useEffect(() => {
    const canvas = sparkleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gridEl = document.querySelector<HTMLElement>(".grid-layer");
    let cols = 5, rows = 5; // defaults
    if (gridEl) {
      const styles = getComputedStyle(gridEl);
      const cVar = styles.getPropertyValue("--grid-cols").trim();
      const rVar = styles.getPropertyValue("--grid-rows").trim();
      const cNum = parseInt(cVar || "", 10);
      const rNum = parseInt(rVar || "", 10);
      if (!isNaN(cNum)) cols = cNum;
      if (!isNaN(rNum)) rows = rNum;
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x:number;y:number;alpha:number;life:number;max:number };
    const particles: P[] = [];

    const spawn = () => {
      const w = canvas.width, h = canvas.height;
      const cellW = w / cols;
      const cellH = h / rows;
      // choose a random intersection
      const i = Math.floor(Math.random() * (cols + 1));
      const j = Math.floor(Math.random() * (rows + 1));
      const x = Math.round(i * cellW);
      const y = Math.round(j * cellH);
      particles.push({ x, y, alpha: 1, life: 0, max: 800 }); // ms
    };

    let last = performance.now();
    const draw = (now: number) => {
      const dt = now - last; last = now;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      // update & draw
      for (let k = particles.length - 1; k >= 0; k--) {
        const p = particles[k];
        p.life += dt;
        p.alpha = Math.max(0, 1 - p.life / p.max);
        // star: small cross
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.translate(p.x, p.y);
        const s = 3; // star size
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
        ctx.moveTo(0, -s); ctx.lineTo(0, s);
        ctx.stroke();
        ctx.restore();
        if (p.life >= p.max) particles.splice(k,1);
      }
      raf = requestAnimationFrame(draw);
    };

    const interval = setInterval(spawn, 1000);
    let raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, []);

  function handleStart() {
    setLeaving(true);
    setTimeout(() => {
      router.push("/login");
    }, 900);
  }

  function togglePlay() {
    const v = bgVideoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      const p = v.play();
      if (p) p.catch(() => {});
      setIsPlaying(true);
    }
  }

  return (
    <div
      className={`relative fixed inset-0 z-50 overflow-hidden bg-[var(--background)] text-[var(--foreground)] ${leaving ? "intro-leave" : ""}`}
      style={{ minHeight: "100dvh" }}
    >
      {/* Force a light canvas behind everything (prevents any black flash/layer bleed) */}
      <div className="fixed inset-0 bg-[var(--background)]" />

      {/* Full-bleed background video shown when playing */}
      <video
        ref={bgVideoRef}
        className={`fixed inset-0 w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? "opacity-[0.10]" : "opacity-0"}`}
        src="/chat2.mp4"
        muted
        loop
        playsInline
      />

      {/* Keep background light even when playing (no dark veil) */}
      {/* When NOT playing, keep it purely light (no dark tint) */}
      <div className={`fixed inset-0 bg-[var(--background)] transition-opacity duration-500 ${isPlaying ? "opacity-0" : "opacity-100"}`} />

      {/* Grid overlay fixed to viewport */}
      <div className="grid-layer" />
      {/* Sparkles canvas above grid, below content */}
      <canvas ref={sparkleCanvasRef} className="fixed inset-0 z-[8] pointer-events-none" />

      {/* Top chrome */}
      <div className="absolute top-6 left-6 z-20 flex items-center gap-2 text-xs md:text-sm tracking-widest text-[var(--foreground)]/80 font-ethno-bold">
        <span>CB ﾒ</span>
        <Image src="/seaitlogo.png" alt="SEAIT" width={48} height={48} className="h-[40px] w-auto" priority />
      </div>
      <a
        className="absolute top-6 right-6 z-20 text-xs md:text-sm tracking-wider text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setShowHowTo(true);
        }}
      >
        How to use?
      </a>

      {/* Centered title */}
      <div className="fixed inset-0 z-10 grid place-items-center px-6 select-none">
        <h1 className="text-[var(--foreground)]/95 font-ethno-bold text-3xl sm:text-5xl md:text-6xl tracking-[0.12em] sm:tracking-[0.35em] md:tracking-[0.6em] text-center leading-tight whitespace-normal sm:whitespace-nowrap animate-rise">
          C h a t  B o x
        </h1>
      </div>

      {/* Lower section: subtitle and button near bottom */}
      <div className="fixed left-0 right-0 z-10 px-6 select-none flex flex-col items-center gap-6 bottom-24 sm:bottom-28 md:bottom-32">
        <p className="text-center max-w-xl text-[var(--foreground)]/70 tracking-wide leading-relaxed animate-fade-in [animation-delay:200ms]">
          Step into ChatBox — Intranet Based Communication Platforms.
        </p>
        <PrimaryButton onClick={handleStart}>Get Started</PrimaryButton>
      </div>

      {/* Bottom-left Play/Pause toggle */}
      <button
        aria-label={isPlaying ? "Pause background" : "Play background"}
        onClick={togglePlay}
        className="absolute left-6 bottom-6 z-20 h-6 w-6 md:h-7 md:w-7 grid place-items-center text-[var(--foreground)]/70 hover:text-[var(--foreground)]"
      >
        {/* Icon */}
        {isPlaying ? (
          <span className="relative block w-4 h-4">
            <span className="absolute inset-y-0 left-0 w-1 bg-current rounded-sm"></span>
            <span className="absolute inset-y-0 right-0 w-1 bg-current rounded-sm"></span>
          </span>
        ) : (
          <span className="block w-0 h-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-current translate-x-[2px]" />
        )}
      </button>
      {showHowTo ? (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/35" onClick={() => setShowHowTo(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_30px_90px_-55px_rgba(15,23,42,0.55)] overflow-hidden">
              <div className="relative px-6 py-5 border-b border-[var(--border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--brand)_14%,var(--surface))] via-[color-mix(in_oklab,var(--brand)_8%,var(--surface))] to-[var(--surface)]">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-[var(--muted-2)]">Getting Started</div>
                    <div className="mt-1 text-xl font-semibold text-[var(--foreground)]">How to use ChatBox</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">ChatBox works on your campus network (Wi‑Fi/LAN).</div>
                  </div>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--brand)_6%,var(--surface))] text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--brand)_10%,var(--surface))] transition"
                    onClick={() => setShowHowTo(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="absolute inset-x-6 bottom-0 translate-y-1 h-[2px] bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--brand)_55%,transparent)] to-transparent" />
              </div>

              <div className="px-6 py-6 space-y-4 text-sm text-[var(--foreground)]">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 shrink-0 rounded-2xl border border-[color-mix(in_oklab,var(--brand)_35%,transparent)] bg-[color-mix(in_oklab,var(--brand)_12%,var(--surface))] grid place-items-center text-[var(--brand)]">
                    <span className="text-lg" aria-hidden="true">📶</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--foreground)]">Connect to campus Wi‑Fi</div>
                    <p className="mt-1 leading-relaxed text-[var(--muted)]">Make sure your phone/PC is connected to the same campus Wi‑Fi or LAN so messaging and calls work.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 shrink-0 rounded-2xl border border-[color-mix(in_oklab,var(--brand)_35%,transparent)] bg-[color-mix(in_oklab,var(--brand)_12%,var(--surface))] grid place-items-center text-[var(--brand)]">
                    <span className="text-lg" aria-hidden="true">🔐</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--foreground)]">Sign in / claim your account</div>
                    <p className="mt-1 leading-relaxed text-[var(--muted)]">Use your school credentials. Students may need to claim their account first (imported by admin).</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 shrink-0 rounded-2xl border border-[color-mix(in_oklab,var(--brand)_35%,transparent)] bg-[color-mix(in_oklab,var(--brand)_12%,var(--surface))] grid place-items-center text-[var(--brand)]">
                    <span className="text-lg" aria-hidden="true">💬</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--foreground)]">Join channels and chat</div>
                    <p className="mt-1 leading-relaxed text-[var(--muted)]">Open General, Section, or Direct Messages. Pin important messages and share files.</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--brand)_6%,var(--surface))] text-xs text-[var(--muted-2)]">
                Tip: You can toggle the ambient background video using the play control in the lower-left corner.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
