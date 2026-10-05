"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, MOTION_OK } from "@/lib/motion/gsap";
import { usePathname } from "@/i18n/navigation";

/**
 * Scroll suave (Lenis) sincronizado con el ticker de GSAP y ScrollTrigger.
 * · No se inicializa con prefers-reduced-motion: reduce.
 * · Touch nativo (syncTouch:false): solo suaviza rueda/trackpad.
 * · Refresca ScrollTrigger cuando cambia la altura del documento
 *   (el catálogo hace streaming) y al navegar.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
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
  }, []);

  // Nueva ruta: arriba del todo sin animar (Lenis conserva su propio destino).
  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true, force: true });
    ScrollTrigger.refresh();
  }, [pathname]);

  return null;
}
