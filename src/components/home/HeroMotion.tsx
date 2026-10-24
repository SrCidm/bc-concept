"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, EASE_OUT, MOTION_OK } from "@/lib/motion/gsap";

/**
 * Movimiento del hero (el único momento "de autor" de la home):
 *   · la foto ya es visible desde el primer pintado (es la imagen LCP) y solo
 *     "asienta": escala 1.06 → 1 en 2,4 s, como la luz que entra;
 *   · el texto entra escalonado con CSS (`animate-hero-rise` en HomeHero, sin
 *     esperar a JS para no retrasar el LCP);
 *   · al hacer scroll, la foto deriva despacio y el texto se aleja y atenúa.
 * Solo transform/opacity. Con reduced-motion: nada se mueve (GSAP solo actúa con
 * no-preference; la animación CSS lleva motion-reduce:animate-none).
 */
export function HeroMotion({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.fromTo(".hero-media", { scale: 1.06 }, { scale: 1, duration: 2.4, ease: EASE_OUT });

        const scrollTrigger = { trigger: ref.current, start: "top top", end: "bottom top", scrub: true };
        gsap.to(".hero-media", { yPercent: 8, ease: "none", scrollTrigger });
        gsap.to(".hero-content", { y: -56, opacity: 0.4, ease: "none", scrollTrigger });
      });

      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}
