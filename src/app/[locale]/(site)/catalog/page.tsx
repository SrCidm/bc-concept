import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";
import { CatalogEmpty } from "@/components/catalog/CatalogEmpty";
import { CatalogError } from "@/components/catalog/CatalogError";
import { CategoryFilter } from "@/components/catalog/CategoryFilter";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import { getCatalogProducts } from "@/lib/catalog/products";
import { parseCatalogParams, type CatalogParams } from "@/lib/catalog/params";

// El catálogo y la búsqueda leen BD por petición: nunca prerenderizar.
export const dynamic = "force-dynamic";

async function CatalogResults({ params }: { params: CatalogParams }) {
  const result = await getCatalogProducts(params);

  if (!result.ok) return <CatalogError params={params} />;
  if (result.products.length === 0) {
    return <CatalogEmpty query={params.q} category={params.cat} outOfRange={params.page > 1} />;
  }
  return (
    <>
      <ProductGrid products={result.products} />
      <CatalogPagination q={params.q} cat={params.cat} page={result.page} totalPages={result.totalPages} />
    </>
  );
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { q?: string | string[]; cat?: string | string[]; page?: string | string[] };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  // ?q= (búsqueda), ?cat= (validada contra STORE_CATEGORIES) y ?page=, combinables.
  const filters = parseCatalogParams(searchParams);
  const { q: query, cat } = filters;

  return (
    <div className="min-h-dvh pt-28 md:pt-36 pb-24 md:pb-32">
      <Container>
        <Reveal
          as="h1"
          variant="lines"
          className="font-serif text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1.05] tracking-[-0.01em] text-bc-text-primary mb-4"
        >
          {t("title")}
        </Reveal>
        <Reveal
          delay={0.15}
          className="mb-8 md:mb-10"
        >
          <p className="text-bc-text-secondary text-lg max-w-prose">
            {query && cat
              ? t("resultsForIn", { query, category: t(`categories.${cat}`) })
              : query
                ? t("resultsFor", { query })
                : t("subtitle")}
          </p>
        </Reveal>
        <CategoryFilter q={query} cat={cat} />
        <Suspense key={`${query}|${cat ?? ""}|${filters.page}`} fallback={<ProductGridSkeleton />}>
          <CatalogResults params={filters} />
        </Suspense>
      </Container>
    </div>
  );
}
