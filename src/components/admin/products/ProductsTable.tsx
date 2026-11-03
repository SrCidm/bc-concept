import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AdminProductListItem } from "@/lib/admin/products.types";
import { formatMoney } from "@/components/admin/import/format";
import { ProductThumb } from "@/components/admin/import/ProductThumb";
import { StatusBadge } from "./StatusBadge";
import { CheckIcon, PendingIcon } from "./icons";
import { productHref } from "./productsHref";

const eur = (n: number) => formatMoney({ amount: n, currency: "EUR" });
// Server Component: no puede llamar a `formatPct` de MarginBreakdown (módulo cliente).
const pctFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatPct = (n: number) => pctFormat.format(n);

function Margin({ item }: { item: AdminProductListItem }) {
  const t = useTranslations("admin.products.table");
  const { check, reason, realShipping } = item.margin;
  if (!check) {
    return <span className="text-bc-text-secondary">{reason === "fx_unavailable" ? t("noFx") : t("noMargin")}</span>;
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span data-below-min={check.belowMin || undefined} className={check.belowMin ? "font-medium text-bc-error" : "text-bc-text-primary"}>
        {formatPct(check.netMarginPct)} %
      </span>
      {check.belowMin ? (
        <span className="text-xs text-bc-error">{t("belowMin")}</span>
      ) : (
        !realShipping && <span className="text-xs text-bc-text-secondary">{t("averageShipping")}</span>
      )}
    </span>
  );
}

function Sample({ verified }: { verified: boolean }) {
  const t = useTranslations("admin.products.sample");
  return verified ? (
    <span className="inline-flex items-center gap-1.5 text-bc-text-primary">
      <CheckIcon className="text-bc-success" />
      {t("yes")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-bc-text-secondary">
      <PendingIcon />
      {t("no")}
    </span>
  );
}

/**
 * Listado de productos (Server Component). Escritorio: tabla densa con cifras
 * alineadas a la derecha; móvil: lista apilada con lo mismo. El título enlaza a
 * la ficha; el coste es dato de admin (esta página ya exige la sesión).
 */
export function ProductsTable({ items }: { items: AdminProductListItem[] }) {
  const t = useTranslations("admin.products");
  const cat = useTranslations("admin.import.dialog.category.options");
  const supplier = useTranslations("admin.import.suppliers");
  const category = (c: AdminProductListItem["category"]) => (c ? cat(c) : t("categoryNone"));

  return (
    <>
      {/* Escritorio */}
      <div className="hidden overflow-x-auto rounded-bc border border-bc-border bg-bc-surface md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t("table.label")}</caption>
          <thead>
            <tr className="border-b border-bc-border text-left text-xs text-bc-text-secondary">
              <th scope="col" className="px-4 py-3 font-normal">{t("table.product")}</th>
              <th scope="col" className="px-3 py-3 font-normal">{t("table.supplier")}</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">{t("table.cost")}</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">{t("table.price")}</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">{t("table.margin")}</th>
              <th scope="col" className="px-3 py-3 font-normal">{t("table.category")}</th>
              <th scope="col" className="px-3 py-3 font-normal">{t("table.sample")}</th>
              <th scope="col" className="px-4 py-3 font-normal">{t("table.status")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="group border-b border-bc-border last:border-b-0 transition-colors duration-150 ease-bc hover-fine:bg-bc-bg-base">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 shrink-0">
                      <ProductThumb src={p.image} alt="" fallbackLabel="" />
                    </div>
                    <Link
                      href={productHref(p.id)}
                      className="line-clamp-2 max-w-[28ch] font-medium leading-snug text-bc-text-primary underline-offset-4 transition-colors duration-150 ease-bc hover-fine:text-bc-accent hover-fine:underline focus-visible:rounded-bc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
                    >
                      {p.title}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-3 text-bc-text-secondary">{supplier(p.supplier)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-bc-text-primary">{eur(p.costEur)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-bc-text-primary">{eur(p.priceRetail)}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <Margin item={p} />
                </td>
                <td className={["px-3 py-3", p.category ? "text-bc-text-primary" : "text-bc-text-secondary"].join(" ")}>{category(p.category)}</td>
                <td className="px-3 py-3">
                  <Sample verified={p.sampleVerified} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil */}
      <ul className="flex flex-col gap-3 md:hidden" aria-label={t("table.label")}>
        {items.map((p) => (
          <li key={p.id} className="rounded-bc border border-bc-border bg-bc-surface p-4">
            <div className="flex items-start gap-3">
              <div className="w-16 shrink-0">
                <ProductThumb src={p.image} alt="" fallbackLabel="" />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={productHref(p.id)}
                  className="line-clamp-2 font-medium leading-snug text-bc-text-primary focus-visible:rounded-bc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
                >
                  {p.title}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-bc-text-secondary">{supplier(p.supplier)}</span>
                </div>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("table.cost")}</dt>
                <dd className="tabular-nums text-bc-text-primary">{eur(p.costEur)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("table.price")}</dt>
                <dd className="tabular-nums text-bc-text-primary">{eur(p.priceRetail)}</dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-bc-text-secondary">{t("table.margin")}</dt>
                <dd className="tabular-nums">
                  <Margin item={p} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-bc-text-secondary">{t("table.category")}</dt>
                <dd className="text-bc-text-primary">{category(p.category)}</dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-bc-text-secondary">{t("table.sample")}</dt>
                <dd>
                  <Sample verified={p.sampleVerified} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
