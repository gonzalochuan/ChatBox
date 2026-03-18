"use client";

import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
};

export default function PrimaryButton({
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={
        `${fullWidth ? "w-full" : ""} inline-flex items-center justify-center rounded-full ` +
        `px-8 py-3 text-[15px] font-semibold tracking-wide text-white ` +
        `bg-gradient-to-b from-[var(--brand-2)] to-[var(--brand)] ` +
        `shadow-[0_14px_30px_-20px_rgba(234,88,12,0.60),0_0_0_1px_rgba(234,88,12,0.35)_inset] ` +
        `hover:brightness-[1.01] active:brightness-[0.98] transition ` +
        `outline-none focus-visible:outline-none ` +
        `disabled:opacity-60 disabled:cursor-not-allowed ` +
        className
      }
      style={{ color: "#ffffff" }}
    >
      {children}
    </button>
  );
}
