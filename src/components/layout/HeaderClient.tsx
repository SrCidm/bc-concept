"use client";

import { useState, useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface NavItem {
  label: string;
  href: string;
}

interface HeaderClientProps {
  navItems: NavItem[];
  cartLabel: string;
  menuLabel: string;
}

function CartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  );
}

/**
 * HeaderClient — Client Component.
 * Handles scroll-based styling and accessible mobile menu.
 * Receives pre-translated strings from the Server Component (Header.tsx).
 */
export function HeaderClient({ navItems, cartLabel, menuLabel }: HeaderClientProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Scroll detection — passive listener for performance
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Focus trap + Escape key for mobile menu
  useEffect(() => {
    if (!menuOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  const navLinkClasses =
    "relative text-sm text-bc-text-primary hover:text-bc-accent " +
    "transition-colors duration-200 ease-bc group";

  return (
    <header
      className={[
        "fixed top-0 inset-x-0 z-50",
        "transition-all duration-300 ease-bc",
        scrolled
          ? "bg-bc-bg-base/80 backdrop-blur-sm border-b border-bc-border"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="max-w-[1180px] mx-auto px-[clamp(1.25rem,4vw,2.5rem)] h-16 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          aria-label="B and C Concept"
          className="font-serif text-xl tracking-brand text-bc-text-primary hover:text-bc-accent transition-colors duration-200 ease-bc"
        >
          B<span className="font-sans">&amp;</span>C
          <span className="mx-0.5 font-sans">:</span> Concept
        </Link>

        {/* Desktop navigation */}
        <nav
          className="hidden md:flex items-center gap-8"
          aria-label="Navegación principal"
        >
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={navLinkClasses}>
              {item.label}
              {/* Animated underline */}
              <span
                className="absolute -bottom-0.5 left-0 h-px w-0 bg-bc-accent transition-all duration-200 ease-bc group-hover:w-full"
                aria-hidden="true"
              />
            </Link>
          ))}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />

          {/* Cart — desktop */}
          <button
            className={
              "hidden md:flex items-center gap-2 text-sm " +
              "text-bc-text-primary hover:text-bc-accent " +
              "transition-colors duration-200 ease-bc " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 rounded-bc"
            }
            aria-label={cartLabel}
          >
            <CartIcon />
            <span>{cartLabel}</span>
          </button>

          {/* Hamburger — mobile */}
          <button
            ref={menuButtonRef}
            className={
              "md:hidden p-2 -mr-2 rounded-bc " +
              "text-bc-text-primary hover:text-bc-accent " +
              "transition-colors duration-200 ease-bc " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
            }
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuLabel}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <HamburgerIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div
          id="mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className={
            "md:hidden bg-bc-bg-base border-t border-bc-border " +
            "py-6 px-[clamp(1.25rem,4vw,2.5rem)]"
          }
        >
          <nav className="flex flex-col gap-1" aria-label="Menú móvil">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "text-base text-bc-text-primary hover:text-bc-accent py-3 " +
                  "border-b border-bc-border/50 last:border-0 " +
                  "transition-colors duration-200 ease-bc"
                }
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile bottom bar */}
          <div className="mt-6 pt-6 border-t border-bc-border flex items-center justify-between">
            <LanguageSwitcher />
            <button
              className="flex items-center gap-2 text-sm text-bc-text-primary hover:text-bc-accent transition-colors duration-200 ease-bc"
              aria-label={cartLabel}
            >
              <CartIcon />
              <span>{cartLabel}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
