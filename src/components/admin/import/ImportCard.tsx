import { useTranslations } from "next-intl";
import type { AdminProductDTO } from "@/lib/suppliers/dto.types";
import { formatInt, formatMoney } from "./format";
import { ImportAction } from "./ImportAction";
import { ProductThumb } from "./ProductThumb";

/**
 * Tarjeta de un producto del proveedor: imagen, nombre, referencia, coste de
 * referencia y stock, más el botón "Importar" (modal de 3.3). Server Component.
 */
export function ImportCard({ product }: { product: AdminProductDTO }) {
  const t = useTranslations("admin.import.card");
  const { stock, delivery } = product;

  const euStock = stock.euTotal > 0;
  const otherStock = Math.max(0, stock.total - stock.euTotal);

  let deliveryText: string | null = null;
  if (delivery.minDays !== null && delivery.maxDays !== null && delivery.minDays !== delivery.maxDays) {
    deliveryText = t("delivery", { min: delivery.minDays, max: delivery.maxDays });
  } else if (delivery.maxDays !== null || delivery.minDays !== null) {
    deliveryText = t("deliverySingle", { days: delivery.maxDays ?? delivery.minDays ?? 0 });
  }

  return (
    <article
      data-product-id={product.supplierProductId}
      className="flex w-full flex-col gap-3 rounded-bc border border-bc-border bg-bc-surface p-3"
    >
      <ProductThumb
        src={product.images[0] ?? null}
        alt=""
        fallbackLabel={t("noImage")}
        dimmed={!euStock}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 font-sans text-sm font-medium leading-snug text-bc-text-primary" title={product.title}>
          {product.title}
        </h3>
        <p className="truncate text-xs text-bc-text-secondary">
          {product.sku ? t("reference", { sku: product.sku }) : `#${product.supplierProductId}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-bc-border pt-3 text-sm">
        <div>
          <dt className="text-xs text-bc-text-secondary">{t("cost")}</dt>
          <dd className="font-medium tabular-nums text-bc-text-primary">{formatMoney(product.cost)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-bc-text-secondary">{t("stock")}</dt>
          <dd className="tabular-nums text-bc-text-primary">
            {euStock ? (
              t("stockEu", { eu: formatInt(stock.euTotal) })
            ) : stock.total > 0 ? (
              <span className="inline-block rounded-bc border border-bc-border px-1.5 py-0.5 text-xs text-bc-text-secondary">
                {t("noStockEu")}
              </span>
            ) : (
              <span className="text-bc-text-secondary">{t("noStock")}</span>
            )}
          </dd>
        </div>
      </dl>

      {(otherStock > 0 || deliveryText) && (
        <p className="-mt-1 text-xs tabular-nums text-bc-text-secondary">
          {[otherStock > 0 ? t("stockOther", { other: formatInt(otherStock) }) : null, deliveryText]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <div className="mt-auto pt-1">
        <ImportAction
          product={{
            id: product.supplierProductId,
            title: product.title,
            image: product.images[0] ?? null,
            sku: product.sku,
          }}
        />
      </div>
    </article>
  );
}
