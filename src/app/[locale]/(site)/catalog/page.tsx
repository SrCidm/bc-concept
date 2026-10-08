import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
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
          className="mb-12 md:mb-16"
        >
          <p className="text-bc-text-secondary text-lg max-w-prose">
            {query ? t("resultsFor", { query }) : t("subtitle")}
          </p>
        </Reveal>
        <Suspense key={query} fallback={<ProductGridSkeleton />}>
          <CatalogResults query={query} />
        </Suspense>
      </Container>
    </div>
  );
}
