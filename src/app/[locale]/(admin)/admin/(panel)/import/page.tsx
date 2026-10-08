import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { importQueryString, parseImportParams } from "@/lib/admin/importParams";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { ImportSearchForm } from "@/components/admin/import/ImportSearchForm";
import { ImportGridSkeleton } from "@/components/admin/import/ImportGridSkeleton";
import { ImportError } from "@/components/admin/import/ImportStates";
import { ImportResults } from "./ImportResults";

export const dynamic = "force-dynamic";

/**
 * Importación desde BigBuy: buscador + grid. El estado vive en la URL
 * (`?q=&page=&eu=0&stock=0`). La página se protege a sí misma y los datos con
 * coste los pide `listAdminCatalog`, que vuelve a exigir la sesión.
 */
export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireAdminPage(); // cada página se protege a sí misma (ver layout)
  const t = await getTranslations("admin.import");
  const parsed = parseImportParams(searchParams);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl text-bc-text-primary md:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-base text-bc-text-secondary">{t("intro")}</p>
      </header>

      {parsed.ok ? (
        <>
          <ImportSearchForm q={parsed.ui.q} eu={parsed.ui.eu} stock={parsed.ui.stock} />
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
