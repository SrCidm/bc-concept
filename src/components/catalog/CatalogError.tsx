import { getTranslations } from "next-intl/server";
import { Link, type AppHref } from "@/i18n/navigation";
import { Reveal } from "@/components/motion/Reveal";
import { catalogQuery, type CatalogParams } from "@/lib/catalog/params";

/** Generic error: never exposes internal details (regla #8). Reintenta la misma vista (q, cat, page). */
export async function CatalogError({ params }: { params: CatalogParams }) {
  const t = await getTranslations("catalog");
  const href: AppHref = { pathname: "/catalog", query: catalogQuery(params) };

  return (
    <Reveal className="py-4 md:py-8 max-w-prose" variant="fade">
      <div role="alert">
        <h2 className="font-serif text-2xl md:text-3xl text-bc-text-primary mb-4">
          {t("errorTitle")}
        </h2>
        <p className="text-bc-text-secondary text-base mb-8">{t("errorBody")}</p>
        <Link
          href={href}
          className="inline-flex items-center min-h-11 text-sm text-bc-accent underline underline-offset-4 hover:text-bc-accent-hover transition-colors duration-200 ease-bc"
        >
          {t("retry")}
        </Link>
      </div>
    </Reveal>
  );
}
