"use client";

import { useEffect } from "react";

export default function RegisterPage() {
  useEffect(() => {
    window.location.replace("/claim");
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black" />
  );
}

