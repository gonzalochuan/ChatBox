"use client";
import Intro from "@/components/Intro";

export default function Home() {
  return (
    <>
      <Intro />
      {/* Fallback minimal content if JS disabled */}
      <noscript>
        <div style={{ padding: 24, color: "#fff", background: "#000" }}>
          <h1 style={{ fontFamily: "Anton, system-ui, sans-serif", fontWeight: 700 }}>CB</h1>
          <p>Enable JavaScript to view the animated introduction. Continue to <a href="/login">Login</a>.</p>
        </div>
      </noscript>
    </>
  );
}
