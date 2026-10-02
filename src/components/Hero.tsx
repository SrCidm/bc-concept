"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

// Register GSAP React plugin once at module level
gsap.registerPlugin(useGSAP);

/**
 * Hero — Client Component (GSAP requires browser APIs).
 * Layout: tagline (italic) · H1 · sub · CTA
 * Two very faint rings (bc-primary, opacity-[0.08]) provide depth without glassmorphism.
 * GSAP fade-up with gsap.matchMedia():
 *   · no-preference → y:22→0, opacity:0→1, stagger 0.12s
 *   · reduce         → instant (CSS .gsap-init { opacity:1 !important } handles it)
 */
export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".hero-item",
          { y: 22, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.12,
            ease: "power3.out",
          }
        );
      });

      // Belt-and-suspenders: ensure visibility for reduced-motion even if
      // the CSS !important doesn't fire in time (e.g., SSR mismatch)
      mm.add("(prefers-reduced-motion: reduce)", () => {
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
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[72vmin] h-[72vmin] rounded-full border border-bc-primary opacity-[0.08]" />
        <div className="absolute w-[46vmin] h-[46vmin] rounded-full border border-bc-primary opacity-[0.08]" />
      </div>

      {/* Hero content */}
      <div className="relative z-10 text-center px-[clamp(1.25rem,4vw,2.5rem)] max-w-3xl mx-auto">
        {/* Tagline — italic accent, appears first */}
        <p
          className="gsap-init hero-item font-serif italic text-bc-accent text-lg md:text-xl mb-5"
          aria-hidden="false"
        >
          {t("tagline")}
        </p>

        {/* Brand headline */}
        <h1
          className="gsap-init hero-item font-serif text-5xl md:text-7xl lg:text-8xl text-bc-text-primary tracking-brand text-balance mb-6"
          aria-label="B and C Concept"
        >
          B<span className="font-sans">&amp;</span>C
          <span className="mx-1 font-sans">:</span> Concept
        </h1>

        {/* Sub copy */}
        <p className="gsap-init hero-item font-sans text-lg text-bc-text-secondary max-w-prose mx-auto mb-10 leading-relaxed">
          {t("sub")}
        </p>

        {/* CTA group */}
        <div className="gsap-init hero-item flex flex-col items-center gap-4">
          <Button href="/catalog" variant="primary" size="lg">
            {tCommon("cta")}
          </Button>
        </div>
      </div>
    </section>
  );
}
