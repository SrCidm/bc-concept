import { getTranslations } from "next-intl/server";
import { Link, type AppHref } from "@/i18n/navigation";
import { Reveal } from "@/components/motion/Reveal";
import type { StoreCategory } from "@/lib/catalog/categories";
import { catalogQuery } from "@/lib/catalog/params";

/**
 * Colección sin resultados. Distingue: búsqueda (con o sin categoría), solo
 * categoría, página fuera de rango y colección vacía. Siempre ofrece una salida.
 */
export async function CatalogEmpty({
  query,
  category,
  outOfRange = false,
}: {
  query: string;
  category: StoreCategory | null;
  outOfRange?: boolean;
}) {
  const t = await getTranslations("catalog");
  const name = category ? t(`categories.${category}`) : "";

  let title: string;
  let body: string;
  let action: { href: AppHref; label: string } | null = null;
  if (outOfRange) {
    title = t("pageEmptyTitle");
    body = t("pageEmptyBody");
    action = { href: { pathname: "/catalog", query: catalogQuery({ q: query, cat: category }) }, label: t("firstPage") };
  } else if (query && category) {
    title = t("noResultsInTitle", { query, category: name });
    body = t("noResultsBody");
    action = { href: { pathname: "/catalog", query: catalogQuery({ q: query }) }, label: t("searchEverywhere") };
  } else if (query) {
    title = t("noResultsTitle", { query });
    body = t("noResultsBody");
    action = { href: "/catalog", label: t("clearSearch") };
  } else if (category) {
    title = t("categoryEmptyTitle", { category: name });
    body = t("categoryEmptyBody");
    action = { href: "/catalog", label: t("clearSearch") };
  } else {
    title = t("emptyTitle");
    body = t("emptyBody");
  }

  return (
    <Reveal className="py-4 md:py-8 max-w-prose" variant="fade">
      <div role="status">
        <h2 className="font-serif text-2xl md:text-3xl text-bc-text-primary mb-4">{title}</h2>
        <p className="text-bc-text-secondary text-base mb-8">{body}</p>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center min-h-11 text-sm text-bc-accent underline underline-offset-4 hover:text-bc-accent-hover transition-colors duration-200 ease-bc"
          >
            {action.label}
          </Link>
        )}
      </div>
    </Reveal>
  );
}
