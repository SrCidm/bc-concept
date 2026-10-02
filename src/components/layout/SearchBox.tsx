"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

interface SearchBoxProps {
  label: string;
  placeholder: string;
  className?: string;
  /** Called after a successful submit (e.g. close the mobile menu). */
  onSubmitted?: () => void;
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

/** Search form → /catalog?q=… (locale-aware). Client Component. */
export function SearchBox({
  label,
  placeholder,
  className = "",
  onSubmitted,
}: SearchBoxProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/catalog?q=${encodeURIComponent(q)}`);
    onSubmitted?.();
  };

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={[
        "flex items-center gap-2 border-b border-bc-border focus-within:border-bc-accent",
        "transition-colors duration-200 ease-bc",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="submit"
        aria-label={label}
        className="text-bc-text-primary hover:text-bc-accent transition-colors duration-200 ease-bc py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent rounded-bc"
      >
        <SearchIcon />
      </button>
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={80}
        autoComplete="off"
        className="w-full min-w-0 bg-transparent text-sm text-bc-text-primary placeholder:text-bc-text-secondary py-1 focus:outline-none"
      />
    </form>
  );
}
