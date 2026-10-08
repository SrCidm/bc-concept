"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Miniatura del producto. Cliente solo por el `onError`: si la imagen falla (o
 * no existe) se muestra un fondo tonal en lugar de un icono roto. `unoptimized`
 * porque el host del CDN real de BigBuy aún no se conoce (no pasa por el
 * optimizador de Next); `referrerPolicy` evita filtrar la URL del panel.
 */
export function ProductThumb({
  src,
  alt,
  fallbackLabel,
  dimmed = false,
}: {
  src: string | null;
  alt: string;
  fallbackLabel: string;
  dimmed?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-bc bg-bc-primary/10">
      {showImage && src ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          referrerPolicy="no-referrer"
          sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw"
          onError={() => setFailed(true)}
          className={[
            "object-cover transition-opacity duration-200 ease-bc",
            dimmed ? "opacity-60" : "",
          ].join(" ")}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-bc-text-secondary">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-xs">{fallbackLabel}</span>
        </div>
      )}
    </div>
  );
}
