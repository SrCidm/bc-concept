"use client";

import { SmoothScroll } from "@/components/providers/SmoothScroll";

/**
 * Proveedor de motion: scroll suave global. Los plugins de GSAP se registran
 * en "@/lib/motion/gsap" (se importa desde cada componente que anima).
 */
export function GsapProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      {children}
    </>
  );
}
