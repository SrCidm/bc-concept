import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";
import { CatalogEmpty } from "@/components/catalog/CatalogEmpty";
import { CatalogError } from "@/components/catalog/CatalogError";
import { getCatalogProducts, normalizeQuery } from "@/lib/catalog/products";

// El catálogo y la búsqueda leen BD por petición: nunca prerenderizar.
export const dynamic = "force-dynamic";

async function CatalogResults({ query }: { query: string }) {
  const result = await getCatalogProducts(query);

  if (!result.ok) return <CatalogError query={query} />;
  if (result.products.length === 0) return <CatalogEmpty query={query} />;
  return <ProductGrid products={result.products} />;
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { q?: string | string[] };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const query = normalizeQuery(searchParams.q);

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <Container>
        <h1 className="font-serif text-4xl md:text-5xl text-bc-text-primary mb-3">
          {t("title")}
        </h1>
        <p className="text-bc-text-secondary text-lg mb-10">
          {query ? t("resultsFor", { query }) : t("subtitle")}
        </p>
        <Suspense key={query} fallback={<ProductGridSkeleton />}>
          <CatalogResults query={query} />
        </Suspense>
      </Container>
    </div>
  );
}
