import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { GsapProvider } from "@/components/providers/GsapProvider";
import { SITE_CLIENT_NAMESPACES, pickMessages } from "@/i18n/clientMessages";
import { siteRobots } from "@/lib/seo";
import { inter, playfair } from "@/lib/fonts";
import "../globals.css";

// Solo los locales conocidos: cualquier otro primer segmento (p. ej. `/x.txt`,
// que no pasa por el middleware) no encaja en ninguna ruta y Next sirve el 404
// raíz (`app/not-found.tsx`) renderizado en el servidor y con estilos.
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  // Fuera de buscadores mientras SITE_NOINDEX=1 (antes del lanzamiento).
  ...siteRobots(),
  title: "B&C: Concept",
  description:
    "Decoración de hogar escandinavo-mediterránea, curada pieza a pieza para una vida serena y elegante.",
  openGraph: {
    siteName: "B&C: Concept",
    locale: "es_ES",
    alternateLocale: "en_GB",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  // Guard: reject unknown locales
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering for this locale
  setRequestLocale(locale);

  // Al cliente solo van los mensajes del storefront (se serializan en el HTML);
  // el panel abre su propio proveedor con admin.* en (admin)/admin/layout.tsx.
  const messages = pickMessages(await getMessages(), SITE_CLIENT_NAMESPACES);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body className="bg-bc-bg-base text-bc-text-primary font-sans antialiased">
        {/* Sin JS el contenido animado debe seguir siendo visible */}
        <noscript>
          <style>{".gsap-init{opacity:1!important}"}</style>
        </noscript>
        <NextIntlClientProvider messages={messages}>
          <GsapProvider>
            {/* Header/Footer del storefront viven en (site)/layout.tsx; el área
                admin ((admin)/admin) no los hereda. */}
            {children}
          </GsapProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
