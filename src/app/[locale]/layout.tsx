import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GsapProvider } from "@/components/providers/GsapProvider";
import { FooterCurtain } from "@/components/layout/FooterCurtain";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  // Cursiva real (el tagline del Hero): sin esto el navegador la sintetiza.
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
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

  // Load all messages for client components (NextIntlClientProvider)
  const messages = await getMessages();

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
            <Header />
            <main className="footer-curtain-main">{children}</main>
            <FooterCurtain>
              <Footer />
            </FooterCurtain>
          </GsapProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
