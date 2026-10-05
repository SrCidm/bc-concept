import { Reveal } from "@/components/motion/Reveal";
import { ProductCard } from "./ProductCard";
import type { ProductPublic } from "@/types/product";

/** Cuadrícula con reveal por lotes (escalonado) al entrar en pantalla. */
export function ProductGrid({ products }: { products: ProductPublic[] }) {
  return (
    <Reveal
      as="ul"
      items
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6"
    >
      {products.map((product, i) => (
        <li key={product.id} data-reveal-item className="gsap-init">
          <ProductCard product={product} priority={i < 4} />
        </li>
      ))}
    </Reveal>
  );
}
