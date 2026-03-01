"use client";

import { useId, useState } from "react";

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  className,
  required,
  disabled,
  name,
  autoComplete,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  autoComplete?: string;
  ariaLabel?: string;
}) {
  const [show, setShow] = useState(false);
  const inputId = useId();

  return (
    <div className="relative">
      <input
        id={inputId}
        name={name}
        type={show ? "text" : "password"}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={className ? `${className} pr-11` : "pr-11"}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md border border-white/15 bg-white/5 hover:bg-white/10 active:bg-white/15"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3l18 18" />
            <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
            <path d="M9.88 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a18.49 18.49 0 0 1-2.16 3.19" />
            <path d="M6.61 6.61A18.38 18.38 0 0 0 2 12s3 7 10 7a10.37 10.37 0 0 0 4.13-.82" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
