import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";

export default function CatalogLoading() {
  return (
    <div className="min-h-dvh pt-28 md:pt-36 pb-24 md:pb-32">
      <Container>
        <Skeleton className="h-14 w-1/2 mb-4" />
        <Skeleton className="h-6 w-1/3 mb-12 md:mb-16" />
        <ProductGridSkeleton />
      </Container>
    </div>
  );
}
