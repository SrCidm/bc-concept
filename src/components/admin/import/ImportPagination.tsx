import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const linkClasses =
  "inline-flex items-center justify-center min-h-11 min-w-11 px-4 rounded-bc border border-bc-border bg-bc-surface text-sm text-bc-text-primary " +
  "transition-[color,background-color,border-color,transform] duration-200 ease-bc " +
  "hover-fine:border-bc-accent hover-fine:text-bc-accent motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent";

const disabledClasses =
  "inline-flex items-center justify-center min-h-11 min-w-11 px-4 rounded-bc border border-bc-border text-sm text-bc-text-secondary opacity-60 select-none";

/**
 * Anterior / Siguiente como enlaces (conservan filtros y el botón atrás funciona).
 * `hrefFor(page)` lo construye quien llama con el query string canónico.
 */
export function ImportPagination({
  page,
  hasMore,
  hrefFor,
}: {
  page: number;
  hasMore: boolean;
  hrefFor: (page: number) => string;
}) {
  const t = useTranslations("admin.import.pagination");
  if (page <= 1 && !hasMore) return null;

  return (
    <nav aria-label={t("label")} className="mt-6 flex items-center justify-between gap-3 md:mt-8">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={linkClasses}>
          {t("prev")}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClasses}>
          {t("prev")}
        </span>
      )}
      <span className="text-sm tabular-nums text-bc-text-secondary">{t("page", { page })}</span>
      {hasMore ? (
        <Link href={hrefFor(page + 1)} rel="next" className={linkClasses}>
          {t("next")}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClasses}>
          {t("next")}
        </span>
      )}
    </nav>
  );
}
