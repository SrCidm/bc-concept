"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import type { AdminProductDetailDTO } from "@/lib/admin/products.types";
import { ProductEditor } from "./ProductEditor";
import { PublishPanel } from "./PublishPanel";
import { SamplePanel } from "./SamplePanel";

/**
 * Ficha de producto: editor y muestra a la izquierda, publicación a la derecha
 * (fija al hacer scroll en escritorio). Tras cada acción se vuelve a pedir la
 * página al servidor (`router.refresh`): requisitos, margen e historial siempre
 * salen de lo guardado. Publicar se bloquea mientras haya cambios sin guardar.
 */
export function ProductWorkspace({ product, history }: { product: AdminProductDetailDTO; history: ReactNode }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const readOnly = product.status !== "draft";
  const refresh = useCallback(() => router.refresh(), [router]);
  const onDirtyChange = useCallback((d: boolean) => {
    setDirty(d);
    if (d) setSaved(false);
  }, []);

  return (
    <div className="flex flex-col gap-12">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        {/* Primero en el DOM (y en móvil): estado, requisitos y la acción. En escritorio va a la derecha. */}
        <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start">
          <PublishPanel product={product} dirty={dirty} onChanged={refresh} />
        </aside>
        <div className="flex min-w-0 flex-col gap-12 lg:col-start-1 lg:row-start-1">
          <ProductEditor
            key={product.updatedAt}
            product={product}
            readOnly={readOnly}
            saved={saved}
            onDirtyChange={onDirtyChange}
            onSaved={() => {
              setSaved(true);
              refresh();
            }}
          />
          <SamplePanel product={product} readOnly={readOnly} onChanged={refresh} />
        </div>
      </div>
      {history}
    </div>
  );
}
