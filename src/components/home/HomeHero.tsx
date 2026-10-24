import { getImageProps } from "next/image";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { HeroMotion } from "./HeroMotion";
import heroDesktop from "../../../public/images/home/hero-desktop.jpg";
import heroMobile from "../../../public/images/home/hero-mobile.jpg";

/**
 * Hero de la home — Server Component (texto e imagen en el HTML; el movimiento
 * lo pone `HeroMotion`, cliente).
 *
 * Dirección de arte con <picture>: 16:9 desde `md` (texto sobre la pared vacía
 * de la izquierda) y 4:5 en móvil (texto arriba). Las imágenes se importan de
 * forma estática y se pintan en modo `fill` + object-cover: el código no depende
 * de su tamaño, así que sustituir el archivo con el mismo nombre no exige
 * cambios. La foto lleva `priority` (fetchpriority alta). El texto entra con una
 * animación CSS (`animate-hero-rise`), no con JS: no retrasa el LCP.
 */
export async function HomeHero() {
  const t = await getTranslations("hero");
  const tHome = await getTranslations("home");
  const tCommon = await getTranslations("common");

  const common = { alt: tHome("heroAlt"), fill: true, sizes: "100vw", priority: true, quality: 80 } as const;
  const { props: desktop } = getImageProps({ ...common, src: heroDesktop });
  const { props: mobile } = getImageProps({ ...common, src: heroMobile });

  return (
    <HeroMotion className="relative isolate flex min-h-[100svh] overflow-hidden bg-bc-primary/15">
      {/* 10 % de margen por arriba: el parallax baja la foto sin dejar hueco. */}
      <div className="hero-media absolute inset-x-0 -top-[10%] bottom-0 -z-20 will-change-transform">
        <picture>
          <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes={desktop.sizes} />
          {/* eslint-disable-next-line @next/next/no-img-element -- <picture> con getImageProps (art direction) */}
          <img {...mobile} alt={mobile.alt} className="object-cover object-[70%_center] md:object-[72%_center]" />
        </picture>
      </div>

      {/* Velo de lectura: aclara la pared donde va el texto (arriba en móvil,
          a la izquierda desde md). Funcional, no decorativo. */}
      <div
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 -z-10 " +
          "bg-gradient-to-b from-bc-bg-base/90 from-25% via-bc-bg-base/70 via-55% to-transparent to-80% " +
          "md:bg-gradient-to-r md:from-bc-bg-base/75 md:via-bc-bg-base/30 md:via-40% md:to-transparent"
        }
      />

      <div className="hero-content mx-auto flex w-full max-w-[1180px] px-[clamp(1.25rem,4vw,2.5rem)] pt-28 pb-16 md:items-center md:pt-24">
        <div className="max-w-[34rem]">
          <p className="hero-item animate-hero-rise [animation-delay:150ms] motion-reduce:animate-none font-serif italic text-bc-accent text-lg md:text-xl mb-4 md:mb-5">
            {t("tagline")}
          </p>
          <h1
            className="hero-item animate-hero-rise [animation-delay:250ms] motion-reduce:animate-none font-serif text-[clamp(3rem,8vw,6rem)] leading-[0.95] tracking-brand text-bc-text-primary mb-6 md:mb-8"
            aria-label="B and C Concept"
          >
            B<span className="font-sans">&amp;</span>C<span className="mx-1 font-sans">:</span>
            <br className="md:hidden" /> Concept
          </h1>
          <p className="hero-item animate-hero-rise [animation-delay:350ms] motion-reduce:animate-none text-base md:text-lg leading-relaxed text-bc-text-primary/80 max-w-[30rem] mb-8 md:mb-10">
            {t("sub")}
          </p>
          <div className="hero-item animate-hero-rise [animation-delay:450ms] motion-reduce:animate-none">
            <Button href="/catalog" variant="primary" size="lg">
              {tCommon("cta")}
            </Button>
          </div>
        </div>
      </div>
    </HeroMotion>
  );
}
