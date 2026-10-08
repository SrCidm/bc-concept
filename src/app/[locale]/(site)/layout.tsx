import { setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FooterCurtain } from "@/components/layout/FooterCurtain";
import { AdminRibbon } from "@/components/layout/AdminRibbon";

/**
 * Cromo del storefront: Header + <main> + Footer con cortina. Antes vivía en el
 * layout raíz; el área admin ((admin)/admin) queda fuera de este grupo para no
 * heredarlo. El grupo (site) no altera ninguna URL.
 */
export default function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(params.locale);

  return (
    <>
      <Header />
      <main className="footer-curtain-main">{children}</main>
      <FooterCurtain>
        <Footer />
      </FooterCurtain>
      {/* Cliente y sin leer sesión en servidor: el storefront sigue siendo estático. */}
      <AdminRibbon />
    </>
  );
}
