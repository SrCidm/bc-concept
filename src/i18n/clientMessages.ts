import type { AbstractIntlMessages } from "next-intl";

/**
 * Qué mensajes viajan al navegador. Todo lo que se pasa a NextIntlClientProvider
 * se serializa en el HTML de la página, así que cada zona recibe SOLO los
 * namespaces que usan sus componentes cliente (`useTranslations` en archivos
 * "use client"). Los Server Components traducen en el servidor y no cuentan.
 * Un test (`clientMessages.test.ts`) comprueba que no falta ninguno.
 */

/** Storefront ((site) y 404): cabecera, buscador, cesta, cinta admin, error de la colección. */
export const SITE_CLIENT_NAMESPACES = ["common", "siteRibbon", "catalog"] as const;

/** Panel admin: solo `admin.*`. Nunca llega al HTML del storefront. */
export const ADMIN_CLIENT_NAMESPACES = ["admin"] as const;

export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const ns of namespaces) {
    if (ns in messages) out[ns] = messages[ns];
  }
  return out;
}
