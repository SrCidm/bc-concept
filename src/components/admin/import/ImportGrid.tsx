import type { AdminProductDTO } from "@/lib/suppliers/dto.types";
import { ImportCard } from "./ImportCard";

/** Rejilla de resultados. Server Component. */
export function ImportGrid({ items, label }: { items: AdminProductDTO[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-6"
    >
      {items.map((p) => (
        <li key={`${p.supplier}:${p.supplierProductId}`} className="flex">
          <ImportCard product={p} />
        </li>
      ))}
    </ul>
  );
}
