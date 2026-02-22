"use client";

import { useEffect, useRef } from "react";

/**
 * SoftOrbsBackground
 * A very subtle set of blurry orbs that float behind content.
 * - Fixed, full-screen canvas
 * - DPR-aware rendering for crisp edges
 * - Uses additive blending and low alpha for a glassmorphic feel
 */
export default function SoftOrbsBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type Orb = { x:number; y:number; r:number; hue:number; alpha:number; dx:number; dy:number };
    const ORB_COUNT = 6;
    const orbs: Orb[] = [];

    const init = () => {
      orbs.length = 0;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      for (let i=0;i<ORB_COUNT;i++) {
        const r = 80 + Math.random()*120; // radius in px
        orbs.push({
          x: Math.random()*w,
          y: Math.random()*h,
          r,
          hue: 200 + Math.random()*60, // blue/cyan range
          alpha: 0.08 + Math.random()*0.07,
          dx: (Math.random()*0.4 - 0.2),
          dy: (Math.random()*0.4 - 0.2)
        });
      }
    };
    init();

    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(40, now - last); // clamp
      last = now;

      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // clear with slight fade for trailing
      ctx.clearRect(0,0,w,h);

      ctx.globalCompositeOperation = "lighter"; // additive

      for (const o of orbs) {
        o.x += o.dx * dt * 0.03; // slow
        o.y += o.dy * dt * 0.03;
        // wrap around softly
        if (o.x < -o.r) o.x = w + o.r; else if (o.x > w + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = h + o.r; else if (o.y > h + o.r) o.y = -o.r;

        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        grad.addColorStop(0, `hsla(${o.hue}, 80%, 60%, ${o.alpha})`);
        grad.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };

    let raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[8] pointer-events-none" />;
}
