import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/Container";

/**
 * Footer — Server Component.
 * bg-bc-accent (oliva oscuro) con texto claro.
 * 4 columnas desktop, 2 columnas móvil, marca a ancho completo.
 */
export async function Footer() {
  const t = await getTranslations("footer");

  const shopLinks = [
    { label: t("all"), href: "/catalog" },
    { label: t("lighting"), href: "/catalog?cat=lighting" },
    { label: t("textiles"), href: "/catalog?cat=textiles" },
    { label: t("deco"), href: "/catalog?cat=deco" },
  ];

  const infoLinks = [
    { label: t("about"), href: "/sobre-nosotros" },
    { label: t("shipping"), href: "/envios" },
    { label: t("contact"), href: "/contacto" },
  ];

  const legalLinks = [
    { label: t("terms"), href: "/aviso-legal" },
    { label: t("privacy"), href: "/privacidad" },
    { label: t("cookies"), href: "/cookies" },
    { label: t("returns"), href: "/devoluciones" },
  ];

  const footerLinkClasses =
    "text-bc-surface/70 hover:text-bc-surface text-sm transition-colors duration-200 ease-bc";

  return (
    <footer className="bg-bc-accent text-bc-surface">
      <Container>
        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-14 md:py-16">
          {/* Brand column — full width on mobile */}
          <div className="col-span-2 md:col-span-1">
            <p
              className="font-serif text-lg tracking-brand mb-3"
              aria-label="B and C Concept"
            >
              B<span className="font-sans">&amp;</span>C
              <span className="mx-0.5 font-sans">:</span> Concept
            </p>
            <p className="text-sm text-bc-surface/70 max-w-[28ch] leading-relaxed">
              {t("brand")}
            </p>
          </div>

          {/* Tienda */}
          <div>
            <h2 className="font-sans text-xs tracking-widest uppercase text-bc-surface/50 mb-4">
              {t("shop")}
            </h2>
            <ul className="flex flex-col gap-3">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Información */}
          <div>
            <h2 className="font-sans text-xs tracking-widest uppercase text-bc-surface/50 mb-4">
              {t("info")}
            </h2>
            <ul className="flex flex-col gap-3">
              {infoLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h2 className="font-sans text-xs tracking-widest uppercase text-bc-surface/50 mb-4">
              {t("legal")}
            </h2>
            <ul className="flex flex-col gap-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-bc-surface/20 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-bc-surface/50">
          <span>{t("copyright")}</span>
          <span>{t("made")}</span>
        </div>
      </Container>
    </footer>
  );
}
