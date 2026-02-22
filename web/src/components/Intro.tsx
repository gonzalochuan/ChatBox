"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
      className={`relative fixed inset-0 z-50 overflow-hidden bg-black text-white ${leaving ? "intro-leave" : ""}`}
      style={{ minHeight: "100dvh" }}
    >
      {/* Full-bleed background video shown when playing */}
      <video
        ref={bgVideoRef}
        className={`fixed inset-0 w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? "opacity-100" : "opacity-0"}`}
        src="/chat2.mp4"
        muted
        loop
        playsInline
      />

      {/* Subtle dark veil for readability when playing (below grid) */}
      <div className={`fixed inset-0 bg-black/50 transition-opacity duration-500 ${isPlaying ? "opacity-100" : "opacity-0"}`} />

      {/* Grid overlay fixed to viewport */}
      <div className="grid-layer" />
      {/* Sparkles canvas above grid, below content */}
      <canvas ref={sparkleCanvasRef} className="fixed inset-0 z-[8] pointer-events-none" />

      {/* Top chrome */}
      <div className="absolute top-6 left-6 z-20 text-xs md:text-sm tracking-widest text-white/80 font-ethno-bold">CB</div>
      <a
        className="absolute top-6 right-6 z-20 text-xs md:text-sm tracking-wider text-white/80 hover:text-white/95"
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
        <h1 className="text-white/80 font-ethno-bold text-3xl sm:text-5xl md:text-6xl tracking-[0.12em] sm:tracking-[0.35em] md:tracking-[0.6em] text-center leading-tight whitespace-normal sm:whitespace-nowrap animate-rise">
          C h a t  B o x
        </h1>
      </div>

      {/* Lower section: subtitle and button near bottom */}
      <div className="fixed left-0 right-0 z-10 px-6 select-none flex flex-col items-center gap-6 bottom-24 sm:bottom-28 md:bottom-32">
        <p className="text-center max-w-xl text-white/80 tracking-wide leading-relaxed animate-fade-in [animation-delay:200ms]">
          Step into ChatBox — Intranet Based Communication Platforms.
        </p>
        <button
          onClick={handleStart}
          className="inline-flex items-center justify-center rounded-full border border-white/50 px-8 py-3 text-white/90 hover:bg-white/5 active:bg-white/10 transition-colors shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset]"
        >
          Get Started
        </button>
      </div>

      {/* Bottom-left Play/Pause toggle */}
      <button
        aria-label={isPlaying ? "Pause background" : "Play background"}
        onClick={togglePlay}
        className="absolute left-6 bottom-6 z-20 h-6 w-6 md:h-7 md:w-7 grid place-items-center text-white/80 hover:text-white/95"
      >
        {/* Icon */}
        {isPlaying ? (
          <span className="relative block w-4 h-4">
            <span className="absolute inset-y-0 left-0 w-1 bg-white rounded-sm"></span>
            <span className="absolute inset-y-0 right-0 w-1 bg-white rounded-sm"></span>
          </span>
        ) : (
          <span className="block w-0 h-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-white translate-x-[2px]" />
        )}
      </button>
      {showHowTo ? (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowHowTo(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-black/80 backdrop-blur-2xl shadow-[0_25px_80px_-40px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="relative px-6 py-5 border-b border-white/10 bg-gradient-to-r from-white/8 via-white/4 to-transparent">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-[0.35em] text-white/70">Getting Started</div>
                    <div className="mt-1 text-lg font-medium text-white/90">How to use ChatBox</div>
                  </div>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
                    onClick={() => setShowHowTo(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="absolute inset-x-6 bottom-0 translate-y-1 h-[2px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              </div>
              <div className="px-6 py-6 space-y-4 text-sm text-white/80">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-2xl border border-emerald-400/30 bg-emerald-500/20 backdrop-blur-sm grid place-items-center text-emerald-200 text-lg">
                    🌐
                  </div>
                  <div>
                    <div className="font-medium text-white/90">Connect to the same network</div>
                    <p className="mt-1 leading-relaxed text-white/70">Ensure all devices join the campus Wi-Fi or LAN IP so peer-to-peer messaging, calls, and file syncing work seamlessly.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-2xl border border-sky-400/30 bg-sky-500/20 backdrop-blur-sm grid place-items-center text-sky-200 text-lg">
                    🔐
                  </div>
                  <div>
                    <div className="font-medium text-white/90">Sign in and explore channels</div>
                    <p className="mt-1 leading-relaxed text-white/70">Use your provided credentials to unlock announcements, subject rooms, and announcements tailored to your role.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-2xl border border-purple-400/30 bg-purple-500/20 backdrop-blur-sm grid place-items-center text-purple-200 text-lg">
                    💬
                  </div>
                  <div>
                    <div className="font-medium text-white/90">Navigate and collaborate</div>
                    <p className="mt-1 leading-relaxed text-white/70">Switch channels from the left rail to chat with classes, teams, or individuals. Share files and pin important messages for quick recall.</p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-white/10 bg-black/70 text-xs text-white/60 flex items-center justify-between">
                <span>Tip: Toggle the ambient background video using the play control in the lower-left corner.</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
