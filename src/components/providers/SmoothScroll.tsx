"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, MOTION_OK } from "@/lib/motion/gsap";
import { usePathname } from "@/i18n/navigation";

/**
 * Scroll suave (Lenis) sincronizado con el ticker de GSAP y ScrollTrigger.
 * · No se inicializa con prefers-reduced-motion: reduce.
 * · No se inicializa en el área admin (/admin/**): en un panel de trabajo la
 *   inercia del scroll estorba. El layout raíz persiste entre storefront y
 *   admin, así que el efecto depende de `isAdmin` y se (des)monta al cruzar.
 * · Touch nativo (syncTouch:false): solo suaviza rueda/trackpad.
 * · Refresca ScrollTrigger cuando cambia la altura del documento
 *   (el catálogo hace streaming) y al navegar.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (isAdmin) return;
    const mm = gsap.matchMedia();

    mm.add(MOTION_OK, () => {
      const lenis = new Lenis({
        duration: 1.15,
        // ease-out exponencial
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        autoRaf: false,
      });
      lenisRef.current = lenis;

      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      return () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
        lenisRef.current = null;
      };
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), 150);
    });
    observer.observe(document.body);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      mm.revert();
    };
  }, [isAdmin]);

  // Nueva ruta: arriba del todo sin animar (Lenis conserva su propio destino).
  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true, force: true });
    ScrollTrigger.refresh();
  }, [pathname]);

  return null;
}
