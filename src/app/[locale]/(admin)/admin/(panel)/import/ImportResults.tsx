import { getTranslations } from "next-intl/server";
import { listAdminCatalog } from "@/lib/admin/catalog";
import { importQueryString, type ImportParams } from "@/lib/admin/importParams";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { ImportEmpty, ImportError, MockBanner } from "@/components/admin/import/ImportStates";
import { ImportGrid } from "@/components/admin/import/ImportGrid";
import { ImportPagination } from "@/components/admin/import/ImportPagination";

const BASE = "/admin/import";
const href = (qs: string) => (qs ? `${BASE}?${qs}` : BASE);

/**
 * Resultados del catálogo. Server Component dentro de <Suspense>: pide los datos
 * con `listAdminCatalog`, que exige la sesión por sí misma (esta página ya pasó
 * por `requireAdminPage`, pero eso no es lo que protege el coste).
 */
export async function ImportResults({ params }: { params: Extract<ImportParams, { ok: true }> }) {
  const t = await getTranslations("admin.import");
  const { query, ui } = params;
  const here = href(importQueryString(ui));
  const clearHref = BASE;

  const result = await listAdminCatalog(query);

  if (!result.ok) {
    if (result.code === "unauthenticated" || result.code === "forbidden") {
      await requireAdminPage(); // la sesión caducó durante la carga: redirige al login
    }
    return <ImportError code={result.code} retryHref={here} />;
  }

  const { data, source } = result;
  const pageHref = (page: number) => href(importQueryString({ ...ui, page }));

  return (
    <div>
      {source === "mock" && <MockBanner />}

      {data.items.length === 0 ? (
        <ImportEmpty q={ui.q} clearHref={clearHref} nextHref={ui.q && data.hasMore ? pageHref(ui.page + 1) : null} />
      ) : (
        <>
          <p role="status" className="mb-3 text-sm tabular-nums text-bc-text-secondary">
            {ui.q
              ? t("results.summarySearch", { shown: data.items.length, fetched: data.fetched, page: data.page, q: ui.q })
              : t("results.summary", { shown: data.items.length, fetched: data.fetched, page: data.page })}
          </p>
          <ImportGrid items={data.items} label={t("results.label")} />
          {ui.q && data.hasMore && <p className="mt-4 text-sm text-bc-text-secondary">{t("results.searchNote")}</p>}
        </>
      )}

      <ImportPagination page={data.page} hasMore={data.hasMore} hrefFor={pageHref} />
    </div>
  );
}
