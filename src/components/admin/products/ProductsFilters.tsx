import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { productsListHref, type ProductsListState } from "./productsHref";

const pill = (active: boolean) =>
  [
    "inline-flex min-h-11 items-center rounded-bc border px-4 text-sm",
    "transition-[color,background-color,border-color] duration-200 ease-bc",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bc-bg-base",
    active
      ? "border-bc-accent bg-bc-accent text-bc-surface"
      : "border-bc-border bg-bc-surface text-bc-text-primary hover-fine:border-bc-accent hover-fine:text-bc-accent",
  ].join(" ");

/**
 * Filtros por estado y proveedor. Son enlaces (el estado vive en la URL, el botón
 * atrás funciona y se puede compartir) y cambiar uno vuelve a la página 1.
 */
export function ProductsFilters({ state }: { state: ProductsListState }) {
  const t = useTranslations("admin.products.filters");
  const groups = [
    {
      key: "status" as const,
      label: t("status.label"),
      options: [
        { value: null, label: t("status.all") },
        { value: "draft" as const, label: t("status.draft") },
        { value: "active" as const, label: t("status.active") },
      ],
    },
    {
      key: "supplier" as const,
      label: t("supplier.label"),
      options: [
        { value: null, label: t("supplier.all") },
        { value: "cj" as const, label: t("supplier.cj") },
        { value: "bigbuy" as const, label: t("supplier.bigbuy") },
      ],
    },
  ];

  return (
    <nav aria-label={t("label")} className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-wrap items-center gap-2" role="group" aria-label={g.label}>
          <span className="mr-1 text-sm text-bc-text-secondary">{g.label}</span>
          {g.options.map((o) => {
            const active = state[g.key] === o.value;
            return (
              <Link
                key={o.label}
                href={productsListHref({ ...state, [g.key]: o.value, page: 1 })}
                aria-current={active ? "page" : undefined}
                className={pill(active)}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
