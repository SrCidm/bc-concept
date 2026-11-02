import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { DEFAULT_IMPORT_SUPPLIER, importQueryString, parseImportParams } from "@/lib/admin/importParams";
import { importSupplierOptions } from "@/lib/admin/importSuppliers";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { ImportSearchForm } from "@/components/admin/import/ImportSearchForm";
import { ImportGridSkeleton } from "@/components/admin/import/ImportGridSkeleton";
import { ImportError } from "@/components/admin/import/ImportStates";
import { SupplierSelector } from "@/components/admin/import/SupplierSelector";
import { ImportResults } from "./ImportResults";

export const dynamic = "force-dynamic";
/** CJ: ~2 s de cola por llamada; el primer listado curado de cada proceso, ~25 s. */
export const maxDuration = 60;

/**
 * Importación desde un proveedor: selector + buscador + grid. El estado vive en
 * la URL (`?supplier=&q=&page=&eu=0&stock=0&curated=0`). La página se protege a sí
 * misma y los datos con coste los pide `listAdminCatalog`, que vuelve a exigir la sesión.
 */
export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireAdminPage(); // cada página se protege a sí misma (ver layout)
  const t = await getTranslations("admin.import");
  const parsed = parseImportParams(searchParams);
  const options = await importSupplierOptions();
  const current = parsed.ok ? parsed.ui.supplier : DEFAULT_IMPORT_SUPPLIER;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl text-bc-text-primary md:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-base text-bc-text-secondary">{t("intro")}</p>
      </header>

      <SupplierSelector current={current} options={options} />

      {parsed.ok ? (
        <>
          <ImportSearchForm
            supplier={parsed.ui.supplier}
            q={parsed.ui.q}
            eu={parsed.ui.eu}
            stock={parsed.ui.stock}
            curated={parsed.ui.curated}
          />
          {/* `key`: cada búsqueda/página nueva vuelve a mostrar el esqueleto. */}
          <Suspense key={importQueryString(parsed.ui)} fallback={<ImportGridSkeleton />}>
            <ImportResults params={parsed} />
          </Suspense>
        </>
      ) : (
        <ImportError code="invalid_request" retryHref="/admin/import" clearHref="/admin/import" />
      )}
    </div>
  );
}
