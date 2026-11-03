import { useTranslations } from "next-intl";
import type { ProductStatus } from "@/lib/admin/products.types";

/** Estado del producto. Activo = se ve en la tienda (marca verde); borrador = neutro. */
export function StatusBadge({ status }: { status: ProductStatus }) {
  const t = useTranslations("admin.products.status");
  const active = status === "active";
  return (
    <span
      data-status={status}
      className={[
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-bc border px-2 py-0.5 text-xs",
        active ? "border-bc-success/40 bg-bc-success/10 text-bc-text-primary" : "border-bc-border bg-bc-bg-base text-bc-text-secondary",
      ].join(" ")}
    >
      <span aria-hidden="true" className={["h-1.5 w-1.5 rounded-full", active ? "bg-bc-success" : "bg-bc-text-secondary/60"].join(" ")} />
      {t(status)}
    </span>
  );
}
