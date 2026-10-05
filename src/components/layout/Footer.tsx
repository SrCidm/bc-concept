import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Footer — Server Component.
 * bg-bc-accent (oliva oscuro) con texto claro. Contraste AA: el texto
 * secundario nunca baja de bc-surface/70 sobre el oliva.
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
    "inline-block py-0.5 text-bc-surface/80 hover:text-bc-surface text-sm " +
    "transition-colors duration-200 ease-bc";

  const columnTitleClasses =
    "font-sans text-xs tracking-widest uppercase text-bc-surface/70 mb-5";

  return (
    <footer className="bg-bc-accent text-bc-surface">
      <Container>
        {/* Main grid */}
        <Reveal
          items
          className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 py-16 md:py-20"
        >
          {/* Brand column — full width on mobile */}
          <div
            data-reveal-item
            className="gsap-init col-span-2 md:col-span-1"
          >
            <p
              className="font-serif text-xl tracking-brand mb-4"
              aria-label="B and C Concept"
            >
              B<span className="font-sans">&amp;</span>C
              <span className="mx-0.5 font-sans">:</span> Concept
            </p>
            <p className="text-sm text-bc-surface/80 max-w-[28ch] leading-relaxed">
              {t("brand")}
            </p>
          </div>

          {/* Tienda */}
          <div data-reveal-item className="gsap-init">
            <h2 className={columnTitleClasses}>{t("shop")}</h2>
            <ul className="flex flex-col gap-2.5">
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
          <div data-reveal-item className="gsap-init">
            <h2 className={columnTitleClasses}>{t("info")}</h2>
            <ul className="flex flex-col gap-2.5">
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
          <div data-reveal-item className="gsap-init">
            <h2 className={columnTitleClasses}>{t("legal")}</h2>
            <ul className="flex flex-col gap-2.5">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </footer>
  );
}
