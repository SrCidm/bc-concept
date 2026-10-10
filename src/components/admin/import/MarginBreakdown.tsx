"use client";

import { useTranslations } from "next-intl";
import type { MarginCheckDTO } from "@/lib/admin/import.types";
import { costRowLabelKey } from "./costDisplay";
import { formatMoney } from "./format";

const pctFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatPct = (n: number) => pctFormat.format(n);

const eur = (n: number) => formatMoney({ amount: n, currency: "EUR" });

/**
 * Desglose de margen. SOLO muestra lo que calculó el servidor (`MarginCheckDTO`):
 * ni fórmula ni parámetros en el cliente.
 */
export function MarginBreakdown({
  check,
  stale,
  costVaries,
}: {
  check: MarginCheckDTO;
  stale: boolean;
  /** Hay variantes con costes distintos: la fila de coste es la de la variante más cara. */
  costVaries: boolean;
}) {
  const t = useTranslations("admin.import.dialog.margin.rows");

  const rows: Array<{ key: string; label: string; value: string; strong?: boolean }> = [
    { key: "price", label: t("price"), value: eur(check.price) },
    { key: "vat", label: t("vat"), value: `− ${eur(check.vat)}` },
    { key: "net", label: t("net"), value: eur(check.netRevenue), strong: true },
    { key: "cost", label: t(costRowLabelKey(costVaries)), value: `− ${eur(check.cost)}` },
    { key: "shipping", label: t("shipping"), value: `− ${eur(check.shipping)}` },
    { key: "stripe", label: t("stripe"), value: `− ${eur(check.stripeFee)}` },
    { key: "returns", label: t("returns"), value: `− ${eur(check.returnsBuffer)}` },
    ...(check.acquisition > 0
      ? [{ key: "acquisition", label: t("acquisition"), value: `− ${eur(check.acquisition)}` }]
      : []),
  ];

  return (
    <dl
      data-margin-breakdown
      aria-busy={stale}
      className={["text-sm tabular-nums transition-opacity duration-150 ease-bc", stale ? "opacity-60" : ""].join(" ")}
    >
      {rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-4 border-b border-bc-border py-1.5">
          <dt className={r.strong ? "font-medium text-bc-text-primary" : "text-bc-text-secondary"}>{r.label}</dt>
          <dd className={r.strong ? "font-medium text-bc-text-primary" : "text-bc-text-primary"}>{r.value}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 pt-2.5">
        <dt className="font-medium text-bc-text-primary">{t("margin")}</dt>
        <dd
          data-net-margin
          className={["text-base font-medium", check.belowMin ? "text-bc-error" : "text-bc-text-primary"].join(" ")}
        >
          {eur(check.netMargin)} · {formatPct(check.netMarginPct)} %
        </dd>
      </div>
    </dl>
  );
}
