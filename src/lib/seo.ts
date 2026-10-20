import type { Metadata } from "next";

/**
 * Sitio fuera de buscadores mientras no se lance: `SITE_NOINDEX=1` (Production
 * y Preview en Vercel). Añade `robots: noindex, nofollow` al metadata del layout
 * raíz y `next.config.mjs` añade la cabecera `X-Robots-Tag`. Se evalúa en el
 * build: al lanzar, quitar la variable y redesplegar.
 */
export function isSiteNoindex(env: Record<string, string | undefined> = process.env): boolean {
  return env.SITE_NOINDEX === "1";
}

/** Fragmento de metadata para el layout raíz (vacío si el sitio es indexable). */
export function siteRobots(env: Record<string, string | undefined> = process.env): Pick<Metadata, "robots"> {
  return isSiteNoindex(env) ? { robots: { index: false, follow: false } } : {};
}
