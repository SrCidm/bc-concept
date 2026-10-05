"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import {
  gsap,
  useGSAP,
  EASE_OUT,
  MOTION_OK,
  MOTION_REDUCED,
} from "@/lib/motion/gsap";

/**
 * Hero — Client Component (GSAP requires browser APIs).
 * Layout: tagline (italic) · H1 · sub · CTA
 * Two very faint rings (bc-primary, opacity-[0.08]) provide depth without glassmorphism.
 * Motion con gsap.matchMedia():
 *   · no-preference → entrada escalonada (ease-out expo) + parallax suave al
 *     hacer scroll (anillos derivan, contenido sube y se atenúa)
 *   · reduce         → contenido visible al instante, sin parallax
 */
export function Hero() {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          ".hero-item",
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1.1,
            stagger: 0.1,
            ease: EASE_OUT,
            clearProps: "transform",
          }
        );

        // Parallax: solo transform/opacity, atado al scroll (scrub).
        const scrollTrigger = {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        };
        gsap.to(".hero-rings", { y: 70, ease: "none", scrollTrigger });
        gsap.to(".hero-content", {
          y: -60,
          opacity: 0.55,
          ease: "none",
          scrollTrigger,
        });
      });

      // Belt-and-suspenders: visible para reduced-motion aunque el CSS falle.
      mm.add(MOTION_REDUCED, () => {
        gsap.set(".hero-item", { opacity: 1, y: 0 });
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  const t = useTranslations("hero");
  const tCommon = useTranslations("common");

  return (
    <section
      ref={containerRef}
      className="relative min-h-dvh flex flex-col items-center justify-center bg-bc-bg-base overflow-hidden"
      aria-label="B and C Concept — Hero"
    >
      {/* Decorative depth rings — aria-hidden, purely visual */}
      <div
        aria-hidden="true"
        className="hero-rings pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[72vmin] h-[72vmin] rounded-full border border-bc-primary opacity-[0.08]" />
        <div className="absolute w-[46vmin] h-[46vmin] rounded-full border border-bc-primary opacity-[0.08]" />
      </div>

      {/* Hero content */}
      <div className="hero-content relative z-10 text-center px-[clamp(1.25rem,4vw,2.5rem)] max-w-3xl mx-auto">
        {/* Tagline — italic accent, appears first */}
        <p className="gsap-init hero-item font-serif italic text-bc-accent text-lg md:text-xl mb-5">
          {t("tagline")}
        </p>

        {/* Brand headline */}
        <h1
          className="gsap-init hero-item font-serif text-5xl md:text-7xl lg:text-8xl text-bc-text-primary tracking-brand text-balance mb-8"
          aria-label="B and C Concept"
        >
          B<span className="font-sans">&amp;</span>C
          <span className="mx-1 font-sans">:</span> Concept
        </h1>

        {/* Sub copy */}
        <p className="gsap-init hero-item font-sans text-lg text-bc-text-secondary max-w-prose mx-auto mb-12 leading-relaxed">
          {t("sub")}
        </p>

        {/* CTA */}
        <div className="gsap-init hero-item flex flex-col items-center">
          <Button href="/catalog" variant="primary" size="lg">
            {tCommon("cta")}
          </Button>
        </div>
      </div>
    </section>
  );
}
