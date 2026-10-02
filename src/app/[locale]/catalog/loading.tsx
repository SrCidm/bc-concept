import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductGridSkeleton } from "@/components/catalog/ProductGridSkeleton";

export default function CatalogLoading() {
  return (
    <div className="min-h-dvh pt-24 pb-16">
      <Container>
        <Skeleton className="h-12 w-1/2 mb-3" />
        <Skeleton className="h-6 w-1/3 mb-10" />
        <ProductGridSkeleton />
      </Container>
    </div>
  );
}
