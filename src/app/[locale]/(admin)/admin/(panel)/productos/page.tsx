import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listAdminProducts, parseAdminProductsQuery } from "@/lib/admin/products";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { ImportPagination } from "@/components/admin/import/ImportPagination";
import { ProductsFilters } from "@/components/admin/products/ProductsFilters";
import { ProductsTable } from "@/components/admin/products/ProductsTable";
import { productsListHref } from "@/components/admin/products/productsHref";
import { noteError, secondaryButton } from "@/components/admin/products/ui";

export const dynamic = "force-dynamic";

/**
 * Productos: borradores importados y activos. Estado en la URL
 * (`?status=draft|active&supplier=cj|bigbuy&page=N`). La página se protege a sí
 * misma y `listAdminProducts` vuelve a exigir la sesión antes de leer la BD.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireAdminPage(); // cada página se protege a sí misma (ver layout)
  const t = await getTranslations("admin.products");
  const query = parseAdminProductsQuery(searchParams);

  const header = (
    <header>
      <h1 className="font-serif text-3xl text-bc-text-primary md:text-4xl">{t("title")}</h1>
      <p className="mt-2 max-w-prose text-base text-bc-text-secondary">{t("intro")}</p>
    </header>
  );

  if (!query) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div role="alert" className={`${noteError} flex flex-wrap items-center justify-between gap-3 text-bc-text-primary`}>
          <p>{t("error.invalidQuery")}</p>
          <Link href="/admin/productos" className={secondaryButton}>
            {t("error.reset")}
          </Link>
        </div>
      </div>
    );
  }

  const result = await listAdminProducts(query);
  if (!result.ok && (result.code === "unauthenticated" || result.code === "forbidden")) {
    await requireAdminPage(); // la sesión caducó entre medias: redirige al login
  }
  const state = { status: query.status === "archived" ? null : query.status, supplier: query.supplier, page: query.page };
  const filtered = state.status !== null || state.supplier !== null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <ProductsFilters state={state} />

      {!result.ok ? (
        <div role="alert" className="rounded-bc border border-bc-border bg-bc-surface p-6">
          <h2 className="font-serif text-xl text-bc-text-primary">{t("error.title")}</h2>
          <p className="mt-2 text-base text-bc-text-secondary">{t("error.body")}</p>
          <a href={`/admin/productos`} className={`${secondaryButton} mt-4`}>
            {t("error.retry")}
          </a>
        </div>
      ) : result.data.items.length === 0 ? (
        <div className="rounded-bc border border-bc-border bg-bc-surface p-6 md:p-8">
          <h2 className="font-serif text-xl text-bc-text-primary">{filtered ? t("empty.filteredTitle") : t("empty.title")}</h2>
          <p className="mt-2 max-w-prose text-base text-bc-text-secondary">{filtered ? t("empty.filteredBody") : t("empty.body")}</p>
          <div className="mt-5">
            {filtered ? (
              <Link href="/admin/productos" className={secondaryButton}>
                {t("empty.clear")}
              </Link>
            ) : (
              <Link href="/admin/import" className={secondaryButton}>
                {t("empty.cta")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p role="status" className="mb-3 text-sm tabular-nums text-bc-text-secondary">
            {t("summary", { total: result.data.total })}
          </p>
          <ProductsTable items={result.data.items} />
          <ImportPagination page={result.data.page} hasMore={result.data.hasMore} hrefFor={(page) => productsListHref({ ...state, page })} />
        </div>
      )}
    </div>
  );
}
