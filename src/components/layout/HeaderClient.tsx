"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SearchBox } from "@/components/layout/SearchBox";
import { CartButton } from "@/components/layout/CartButton";
import { iconControlClasses } from "@/components/layout/controlStyles";

interface NavItem {
  label: string;
  href: string;
}

interface HeaderClientProps {
  navItems: NavItem[];
  menuLabel: string;
  navLabel: string;
  mobileNavLabel: string;
  menuDialogLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
}

/** Duración de la salida del menú (debe igualar animate-menu-out: 140ms). */
const MENU_EXIT_MS = 140;

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
 * Estilo según scroll y menú móvil accesible con entrada/salida animadas.
 * Recibe las cadenas ya traducidas desde el Server Component (Header.tsx).
 */
export function HeaderClient({
  navItems,
  menuLabel,
  navLabel,
  mobileNavLabel,
  menuDialogLabel,
  searchLabel,
  searchPlaceholder,
}: HeaderClientProps) {
  const [scrolled, setScrolled] = useState(false);
  // `menuOpen` gobierna el estado; `menuMounted` mantiene el panel en el DOM
  // el tiempo justo para que se vea la animación de salida.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openMenu = useCallback(() => {
    clearTimeout(unmountTimer.current);
    setMenuMounted(true);
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    clearTimeout(unmountTimer.current);
    unmountTimer.current = setTimeout(() => setMenuMounted(false), MENU_EXIT_MS);
  }, []);

  useEffect(() => () => clearTimeout(unmountTimer.current), []);

  // Scroll detection — passive listener for performance
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Focus trap + Escape key for mobile menu
  useEffect(() => {
    if (!menuOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
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
  }, [menuOpen, closeMenu]);

  const navLinkClasses =
    "relative text-sm text-bc-text-primary hover:text-bc-accent " +
    "transition-colors duration-200 ease-bc group";


  const solid = scrolled || menuMounted;

  return (
    <header
      className={[
        "fixed top-0 inset-x-0 z-50 border-b",
        "transition-[background-color,border-color,backdrop-filter] duration-300 ease-bc",
        solid
          ? "bg-bc-bg-base/85 backdrop-blur-sm border-bc-border"
          : "bg-transparent border-transparent",
      ].join(" ")}
    >
      <div className="max-w-[1180px] mx-auto px-[clamp(1.25rem,4vw,2.5rem)] h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link
          href="/"
          aria-label="B and C Concept"
          className="shrink-0 font-serif text-xl tracking-brand text-bc-text-primary hover:text-bc-accent transition-colors duration-200 ease-bc"
        >
          B<span className="font-sans">&amp;</span>C
          <span className="mx-0.5 font-sans">:</span> Concept
        </Link>

        {/* Desktop navigation */}
        <nav
          className="hidden lg:flex items-center gap-6 xl:gap-8"
          aria-label={navLabel}
        >
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={navLinkClasses}>
              {item.label}
              {/* Animated underline */}
              <span
                className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-bc-accent transition-transform duration-300 ease-bc group-hover:scale-x-100"
                aria-hidden="true"
              />
            </Link>
          ))}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Search — desktop: colapsable (lupa → campo). El hueco se reserva a
              su ancho expandido para que la navegación no se desplace al abrir. */}
          <div className="hidden lg:flex justify-end w-40 xl:w-60">
            <Suspense fallback={null}>
              <SearchBox
                collapsible
                label={searchLabel}
                placeholder={searchPlaceholder}
              />
            </Suspense>
          </div>

          <LanguageSwitcher />

          {/* Cesta — desktop: en reposo solo la bolsa; al hover se despliega la
              etiqueta. El hueco (w-24) se reserva para que no pise al idioma. */}
          <div className="hidden lg:flex justify-end w-24 -mr-3">
            <CartButton variant="icon" />
          </div>

          {/* Hamburger — mobile / tablet (44px target) */}
          <button
            ref={menuButtonRef}
            className={`lg:hidden size-11 -mr-2 flex items-center justify-center ${iconControlClasses}`}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuLabel}
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
          >
            <HamburgerIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuMounted && (
        <div
          id="mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={menuDialogLabel}
          data-state={menuOpen ? "open" : "closed"}
          className={
            "lg:hidden origin-top bg-bc-bg-base border-t border-bc-border " +
            "py-6 px-[clamp(1.25rem,4vw,2.5rem)] " +
            "data-[state=open]:animate-menu-in data-[state=closed]:animate-menu-out " +
            "motion-reduce:animate-none"
          }
        >
          <Suspense fallback={null}>
            <SearchBox
              label={searchLabel}
              placeholder={searchPlaceholder}
              className="mb-4"
              onSubmitted={closeMenu}
            />
          </Suspense>

          <nav className="flex flex-col" aria-label={mobileNavLabel}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "text-base text-bc-text-primary hover:text-bc-accent min-h-11 flex items-center " +
                  "border-b border-bc-border/50 last:border-0 " +
                  "transition-colors duration-200 ease-bc"
                }
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile bottom bar */}
          <div className="mt-6 pt-4 border-t border-bc-border flex justify-end">
            <CartButton className="-mr-3" />
          </div>
        </div>
      )}
    </header>
  );
}
