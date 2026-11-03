import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAdminProduct } from "@/lib/admin/products";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { ProductThumb } from "@/components/admin/import/ProductThumb";
import { ProductHistory } from "@/components/admin/products/ProductHistory";
import { ProductWorkspace } from "@/components/admin/products/ProductWorkspace";
import { StatusBadge } from "@/components/admin/products/StatusBadge";
import { ArrowLeftIcon } from "@/components/admin/products/icons";
import { noteError, secondaryButton } from "@/components/admin/products/ui";

export const dynamic = "force-dynamic";

const backLink =
  "inline-flex min-h-11 items-center gap-1.5 rounded-bc pr-2 text-sm text-bc-text-secondary transition-colors duration-150 ease-bc " +
  "hover-fine:text-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent";

/**
 * Ficha de un producto: revisar textos ES/EN, categoría, PVP con la guarda en
 * vivo, muestra, publicación e historial. La página se protege a sí misma y
 * `getAdminProduct` vuelve a exigir la sesión antes de leer la BD.
 */
export default async function AdminProductPage({ params }: { params: { id: string } }) {
  await requireAdminPage(); // cada página se protege a sí misma (ver layout)
  const t = await getTranslations("admin.products");
  const supplier = await getTranslations("admin.import.suppliers");
  const result = await getAdminProduct(params.id);

  const back = (
    <Link href="/admin/productos" className={backLink}>
      <ArrowLeftIcon />
      {t("edit.back")}
    </Link>
  );

  if (!result.ok) {
    if (result.code === "unauthenticated" || result.code === "forbidden") await requireAdminPage();
    const missing = result.code === "not_found";
    return (
      <div className="flex flex-col gap-6">
        {back}
        <div role="alert" className={`${noteError} flex flex-col items-start gap-3 text-bc-text-primary`}>
          <p className="font-medium">{missing ? t("edit.notFoundTitle") : t("error.title")}</p>
          <p className="text-bc-text-secondary">{missing ? t("edit.notFoundBody") : t("error.body")}</p>
          <Link href="/admin/productos" className={secondaryButton}>
            {t("edit.back")}
          </Link>
        </div>
      </div>
    );
  }

  const p = result.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        {back}
        <header className="flex items-start gap-4">
          <div className="w-20 shrink-0 md:w-24">
            <ProductThumb src={p.images[0] ?? null} alt="" fallbackLabel={t("table.noImage")} />
          </div>
          <div className="min-w-0">
            <h1 className="font-serif text-2xl leading-tight text-bc-text-primary [text-wrap:balance] md:text-3xl">{p.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={p.status} />
              <span className="text-sm text-bc-text-secondary">{t("edit.reference", { supplier: supplier(p.supplier), id: p.supplierProductId })}</span>
            </div>
          </div>
        </header>
      </div>

      <ProductWorkspace product={p} history={<ProductHistory events={p.events} />} />
    </div>
  );
}
