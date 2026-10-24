import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { STORE_CATEGORIES, type StoreCategory } from "@/lib/catalog/categories";
import { catalogQuery } from "@/lib/catalog/params";

/**
 * Filtro por categoría de la colección (Server Component, enlaces: funciona sin
 * JS). Conserva `?q=` y vuelve a la página 1. El filtro activo se ve (relleno
 * oliva) y se quita con el mismo botón (icono ×) o con "Todas".
 */
function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const pill =
  "inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm border " +
  "transition-[background-color,border-color,color] duration-200 ease-bc " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bc-bg-base";
const idle = "border-bc-border text-bc-text-primary hover:border-bc-accent hover:text-bc-accent";
const active = "border-bc-accent bg-bc-accent text-bc-surface hover:bg-bc-accent-hover hover:border-bc-accent-hover";

export async function CategoryFilter({ q, cat }: { q: string; cat: StoreCategory | null }) {
  const t = await getTranslations("catalog");

  return (
    <nav aria-label={t("filterLabel")} className="mb-10 md:mb-12">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={{ pathname: "/catalog", query: catalogQuery({ q }) }}
            aria-current={cat === null ? "true" : undefined}
            className={`${pill} ${cat === null ? active : idle}`}
          >
            {t("all")}
          </Link>
        </li>
        {STORE_CATEGORIES.map((c) => {
          const name = t(`categories.${c}`);
          const isActive = c === cat;
          return (
            <li key={c}>
              <Link
                // Activa: el mismo botón quita el filtro (conserva la búsqueda).
                href={{ pathname: "/catalog", query: catalogQuery(isActive ? { q } : { q, cat: c }) }}
                aria-current={isActive ? "true" : undefined}
                aria-label={isActive ? t("removeFilter", { name }) : undefined}
                className={`${pill} ${isActive ? active : idle}`}
              >
                {name}
                {isActive && <CloseIcon />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
