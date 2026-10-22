"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname, type RouterHref } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/**
 * LanguageSwitcher — Client Component.
 * Cambia de idioma conservando la ruta (que next-intl traduce: `/coleccion` ↔
 * `/en/collection`), sus parámetros y la query (`?q=`). La query se lee al
 * pulsar (no con useSearchParams, que sacaría de SSG a las páginas estáticas).
 * Uses aria-pressed to communicate the active locale to assistive tech.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  const params = useParams();

  const handleSwitch = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    // `pathname` es la ruta interna (p. ej. "/product/[slug]") y `params` trae
    // sus valores: juntos forman un destino válido para cualquier ruta.
    const href = { pathname, params, query } as RouterHref;
    router.replace(href, { locale: nextLocale });
  };

  return (
    <div
      role="group"
      aria-label={t("selectLanguage")}
      className="flex items-center gap-0.5"
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
              // Objetivo táctil ≥44px en móvil/tablet; compacto con puntero fino.
              "max-lg:min-h-11 max-lg:min-w-11",
              "transition-[color,transform] ease-bc duration-200",
              "motion-safe:active:scale-95",
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
