import Image from "next/image";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DeliveryBadge } from "@/components/ui/DeliveryBadge";
import type { ProductPublic } from "@/types/product";

interface ProductCardProps {
  product: ProductPublic;
  /** First row of the grid: load eagerly for LCP. */
  priority?: boolean;
}

/**
 * ProductCard — Server Component. Only public fields (products_public).
 * Motion: hover (solo con puntero real, ver tailwind future.hoverOnlyWhenSupported)
 * eleva con sombra y asienta la imagen; :active comprime ligeramente (0.985);
 * sin movimiento en reduced-motion.
 */
export async function ProductCard({ product, priority = false }: ProductCardProps) {
  const locale = await getLocale();
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: product.currency,
  }).format(product.price_retail);
  const image = product.images[0];
  const href = product.slug ? `/product/${product.slug}` : "/catalog";

  return (
    <Link
      href={href}
      className={
        "group flex h-full flex-col bg-bc-surface border border-bc-border rounded-bc overflow-hidden " +
        "transition-[box-shadow,border-color,transform] duration-300 ease-bc " +
        "hover:shadow-premium hover:border-transparent " +
        "motion-safe:active:scale-[0.985] motion-safe:active:duration-150 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
      }
    >
      {/* Placeholder tonal visible si no hay imagen o mientras carga */}
      <div className="relative aspect-[4/5] bg-bc-primary/10 overflow-hidden">
        {image && (
          <Image
            src={image}
            alt={product.title}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-bc motion-safe:group-hover:scale-[1.035]"
          />
        )}
      </div>
      <div className="p-4 md:p-5 flex flex-col gap-2">
        {product.category && (
          <span className="text-xs uppercase tracking-brand text-bc-text-secondary">
            {product.category}
          </span>
        )}
        <h3 className="font-serif text-lg leading-snug text-bc-text-primary line-clamp-2 transition-colors duration-200 ease-bc group-hover:text-bc-accent">
          {product.title}
        </h3>
        <p className="text-base text-bc-text-primary tabular-nums">{price}</p>
        <DeliveryBadge
          minDays={product.delivery_min_days}
          maxDays={product.delivery_max_days}
        />
      </div>
    </Link>
  );
}
