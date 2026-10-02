import { ProductCard } from "./ProductCard";
import type { ProductPublic } from "@/types/product";

export function ProductGrid({ products }: { products: ProductPublic[] }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6">
      {products.map((product, i) => (
        <li key={product.id}>
          <ProductCard product={product} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
