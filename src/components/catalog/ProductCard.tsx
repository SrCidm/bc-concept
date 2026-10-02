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
        "group block bg-bc-surface border border-bc-border rounded-bc overflow-hidden " +
        "transition-shadow duration-300 ease-bc hover:shadow-premium " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
      }
    >
      <div className="relative aspect-[4/5] bg-bc-bg-base overflow-hidden">
        {image && (
          <Image
            src={image}
            alt={product.title}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-bc motion-safe:group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="p-4 flex flex-col gap-2">
        {product.category && (
          <span className="text-xs uppercase tracking-brand text-bc-text-secondary">
            {product.category}
          </span>
        )}
        <h3 className="font-serif text-lg leading-snug text-bc-text-primary line-clamp-2">
          {product.title}
        </h3>
        <p className="text-base text-bc-text-primary">{price}</p>
        <DeliveryBadge
          minDays={product.delivery_min_days}
          maxDays={product.delivery_max_days}
        />
      </div>
    </Link>
  );
}
