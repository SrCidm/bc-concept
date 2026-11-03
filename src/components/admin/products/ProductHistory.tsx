import { useTranslations } from "next-intl";
import type { ProductEventDTO } from "@/lib/admin/products.types";
import { formatMoney } from "@/components/admin/import/format";
import { formatWhen, pct } from "./format";

const eur = (n: number) => formatMoney({ amount: n, currency: "EUR" });

/** Historial del producto (solo inserción en la BD), más reciente primero. Server Component. */
export function ProductHistory({ events }: { events: ProductEventDTO[] }) {
  const t = useTranslations("admin.products.edit.history");

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4">
      <h2 id="history-title" className="font-serif text-xl text-bc-text-primary">
        {t("title")}
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-bc-text-secondary">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-bc-border rounded-bc border border-bc-border bg-bc-surface" data-history>
          {events.map((e) => {
            const fields = e.fields.map((f) => (["title", "description", "title_en", "description_en", "category", "price_retail"].includes(f) ? t(`fields.${f}`) : f));
            const priceChanged = e.priceBefore !== null && e.priceAfter !== null && e.priceBefore !== e.priceAfter;
            return (
              <li key={e.id} data-action={e.action} className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
                <div className="flex flex-col">
                  <span className="tabular-nums text-bc-text-primary">{formatWhen(e.createdAt)}</span>
                  <span className="truncate text-xs text-bc-text-secondary">{e.actor}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium text-bc-text-primary">{t(`actions.${e.action}`)}</span>
                  {fields.length > 0 && <span className="text-bc-text-secondary">{t("changed", { fields: fields.join(", ") })}</span>}
                  {priceChanged && (
                    <span className="tabular-nums text-bc-text-secondary">{t("price", { from: eur(e.priceBefore as number), to: eur(e.priceAfter as number) })}</span>
                  )}
                  {e.notes && <span className="whitespace-pre-line text-bc-text-secondary">«{e.notes}»</span>}
                  {e.marginPct !== null && (
                    <span className="tabular-nums text-bc-text-secondary">{t(e.action === "import" ? "marginImport" : "margin", { pct: pct(e.marginPct) })}</span>
                  )}
                  {e.marginBeforePct !== null && <span className="tabular-nums text-bc-text-secondary">{t("marginBefore", { pct: pct(e.marginBeforePct) })}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
