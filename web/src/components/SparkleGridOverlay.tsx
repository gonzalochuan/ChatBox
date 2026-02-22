"use client";

import { useEffect, useRef } from "react";

export default function SparkleGridOverlay({ intervalMs = 1000, variant = "random" as "random"|"grid" }: { intervalMs?: number; variant?: "random" | "grid" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gridEl = document.querySelector<HTMLElement>(".grid-layer");
    let cols = 5, rows = 5; // defaults if CSS vars missing
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
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing to CSS pixels
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x:number;y:number;alpha:number;life:number;max:number };
    const particles: P[] = [];
    let gridPoints: {x:number;y:number;phase:number}[] = [];

    const spawn = () => {
      const w = canvas.width, h = canvas.height;
      const cellW = w / cols;
      const cellH = h / rows;
      // choose a random intersection, including outer edges
      const i = Math.floor(Math.random() * (cols + 1));
      const j = Math.floor(Math.random() * (rows + 1));
      // snap to device pixel grid for crisp alignment with 1px grid lines
      const snap = (v: number) => Math.round(v) + 0.5; // center of CSS pixel for 1px stroke
      const x = snap(i * cellW);
      const y = snap(j * cellH);
      particles.push({ x, y, alpha: 1, life: 0, max: 800 });
    };

    const buildGridPoints = () => {
      const w = canvas.width, h = canvas.height;
      const cellW = w / cols;
      const cellH = h / rows;
      const snap = (v: number) => Math.round(v) + 0.5;
      const pts: {x:number;y:number;phase:number}[] = [];
      for (let i=0;i<=cols;i++) {
        for (let j=0;j<=rows;j++) {
          const x = snap(i * cellW);
          const y = snap(j * cellH);
          // phase offset to make a wave across the grid
          const phase = (i + j) * 0.35;
          pts.push({ x, y, phase });
        }
      }
      gridPoints = pts;
    };

    let last = performance.now();
    const draw = (now: number) => {
      const dt = now - last; last = now;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if (variant === "random") {
        for (let k = particles.length - 1; k >= 0; k--) {
          const p = particles[k];
          p.life += dt;
          p.alpha = Math.max(0, 1 - p.life / p.max);
          // tiny cross star
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1;
          ctx.translate(p.x, p.y);
          const s = 2.5;
          ctx.beginPath();
          ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
          ctx.moveTo(0, -s); ctx.lineTo(0, s);
          ctx.stroke();
          ctx.restore();
          if (p.life >= p.max) particles.splice(k,1);
        }
      } else {
        // grid variant: place a tiny twinkle at every intersection
        const t = performance.now() / 1000;
        for (const gp of gridPoints) {
          const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin((t + gp.phase) * 2.6));
          ctx.save();
          ctx.globalAlpha = pulse * 0.7;
          ctx.strokeStyle = "rgba(255,255,255,1)";
          ctx.lineWidth = 1;
          ctx.translate(gp.x, gp.y);
          const s = 2.5;
          ctx.beginPath();
          ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
          ctx.moveTo(0, -s); ctx.lineTo(0, s);
          ctx.stroke();
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };

    let interval: number | undefined;
    if (variant === "random") {
      interval = window.setInterval(spawn, intervalMs);
    } else {
      buildGridPoints();
    }
    let raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      if (interval) clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [intervalMs, variant]);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[8] pointer-events-none" />;
}
