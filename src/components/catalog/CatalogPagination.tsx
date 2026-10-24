import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreCategory } from "@/lib/catalog/categories";
import { catalogQuery } from "@/lib/catalog/params";

/** Paginación de la colección (Server Component). Conserva `?q=` y `?cat=`. */
export async function CatalogPagination({
  q,
  cat,
  page,
  totalPages,
}: {
  q: string;
  cat: StoreCategory | null;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const t = await getTranslations("catalog.pagination");
  const link =
    "inline-flex items-center min-h-11 px-4 rounded-bc text-sm text-bc-accent border border-bc-border " +
    "transition-[border-color,color] duration-200 ease-bc hover:border-bc-accent " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bc-bg-base";
  const off = "inline-flex items-center min-h-11 px-4 rounded-bc text-sm text-bc-text-secondary/60 border border-bc-border/60";

  return (
    <nav aria-label={t("label")} className="mt-14 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={{ pathname: "/catalog", query: catalogQuery({ q, cat, page: page - 1 }) }} rel="prev" className={link}>
          {t("previous")}
        </Link>
      ) : (
        <span aria-hidden="true" className={off}>{t("previous")}</span>
      )}
      <p className="text-sm tabular-nums text-bc-text-secondary">{t("status", { page, total: totalPages })}</p>
      {page < totalPages ? (
        <Link href={{ pathname: "/catalog", query: catalogQuery({ q, cat, page: page + 1 }) }} rel="next" className={link}>
          {t("next")}
        </Link>
      ) : (
        <span aria-hidden="true" className={off}>{t("next")}</span>
      )}
    </nav>
  );
}
