import { defineRouting } from "next-intl/routing";

/**
 * Rutas localizadas. La clave es la ruta interna (la carpeta en `app/[locale]`)
 * y el valor, la URL pública por idioma; next-intl reescribe la pública a la
 * interna y redirige la de otro idioma a la suya (`/en/coleccion` → `/en/collection`).
 * `Link`/`useRouter` de `@/i18n/navigation` aceptan SOLO estas claves (tipado):
 * con query, `{ pathname, query }`.
 *
 * El área admin (`/admin/**`) es solo ES y queda fuera de la negociación de
 * idioma (ver `middleware.ts`); sus rutas no se localizan. `/api/**` ni pasa por
 * el middleware. Las rutas del pie aún sin página (envíos, legal) dan el 404 de
 * marca hasta que existan.
 */
export const routing = defineRouting({
  locales: ["es", "en"] as const,
  defaultLocale: "es",
  localePrefix: "as-needed",
  pathnames: {
    "/": "/",
    "/catalog": { es: "/coleccion", en: "/collection" },
    "/sobre-nosotros": { es: "/sobre-nosotros", en: "/about" },
    "/contacto": { es: "/contacto", en: "/contact" },
    "/product/[slug]": "/product/[slug]",
    "/envios": "/envios",
    "/aviso-legal": "/aviso-legal",
    "/privacidad": "/privacidad",
    "/cookies": "/cookies",
    "/devoluciones": "/devoluciones",
    "/admin": "/admin",
    "/admin/login": "/admin/login",
    "/admin/import": "/admin/import",
    "/admin/ajustes": "/admin/ajustes",
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
