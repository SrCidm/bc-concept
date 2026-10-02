"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/**
 * LanguageSwitcher — Client Component.
 * Switches locale while preserving the current pathname.
 * Uses aria-pressed to communicate the active locale to assistive tech.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleSwitch = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <div
      role="group"
      aria-label="Seleccionar idioma"
      className="flex items-center gap-1"
    >
      {routing.locales.map((loc) => {
        const isActive = locale === loc;
        return (
          <button
            key={loc}
            onClick={() => handleSwitch(loc as Locale)}
            aria-pressed={isActive}
            className={[
              "text-xs font-sans tracking-widest px-2 py-1 rounded-bc",
              "transition-colors ease-bc duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-1",
              isActive
                ? "text-bc-accent font-semibold"
                : "text-bc-text-secondary hover:text-bc-accent",
            ].join(" ")}
          >
            {loc.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
