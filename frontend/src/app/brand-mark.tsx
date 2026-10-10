import type { ReactNode } from "react";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
        <rect width="40" height="40" rx="13" fill="#D9E9BE" />
        <path
          d="M20 8.5c-6.5 4.1-9.5 9-8.9 13.6.4 3.2 2.7 5.4 5.7 5.4 5.8 0 9.5-6.2 11-17.6-2.8.2-5.3-.2-7.8-1.4Z"
          fill="#284238"
        />
        <path
          d="M12.5 31c3.3-5.5 7.5-9.5 13.2-12.8"
          stroke="#284238"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <span className="brand-lockup">
      <BrandMark />
      <span>{children ?? "DineSmart"}</span>
    </span>
  );
}
