import Image, { type StaticImageData } from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import catLighting from "../../../public/images/home/cat-iluminacion.jpg";
import catTextiles from "../../../public/images/home/cat-textiles.jpg";
import catDecor from "../../../public/images/home/cat-decoracion.jpg";

/**
 * Las tres familias de la colección (Server Component). Valores de categoría =
 * `STORE_CATEGORIES` (lighting · textiles · decor). Imágenes 4:5 en `fill` +
 * object-cover dentro de una caja con proporción fija: no dependen del tamaño
 * del archivo.
 *
 * Accesibilidad: la imagen conserva su `alt` (fuera del enlace) y el enlace se
 * nombra solo con la categoría; su `::after` cubre toda la pieza para que sea
 * clicable entera. Ritmo editorial: la del centro baja un escalón desde `md`.
 */
const CATEGORIES: { key: "lighting" | "textiles" | "decor"; image: StaticImageData }[] = [
  { key: "lighting", image: catLighting },
  { key: "textiles", image: catTextiles },
  { key: "decor", image: catDecor },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export async function HomeCategories() {
  const t = await getTranslations("home");

  return (
    <section className="py-24 md:py-36">
      <Container>
        <div className="max-w-2xl mb-12 md:mb-16">
          <Reveal
            as="h2"
            variant="lines"
            className="font-serif text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] tracking-[-0.01em] text-bc-text-primary mb-4"
          >
            {t("categoriesTitle")}
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-bc-text-secondary text-lg leading-relaxed">{t("categoriesIntro")}</p>
          </Reveal>
        </div>

        <Reveal items className="grid gap-12 md:grid-cols-3 md:gap-8 lg:gap-10">
          {CATEGORIES.map(({ key, image }, i) => (
            <figure
              key={key}
              data-reveal-item
              className={`gsap-init group relative ${i === 1 ? "md:mt-20" : ""}`}
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-bc bg-bc-primary/15">
                <Image
                  src={image}
                  alt={t(`categories.${key}.alt`)}
                  fill
                  sizes="(min-width: 1180px) 360px, (min-width: 768px) 31vw, 100vw"
                  quality={75}
                  className={
                    "object-cover transition-transform duration-[1200ms] ease-bc " +
                    "group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  }
                />
              </div>
              <figcaption className="mt-5 flex items-baseline justify-between gap-4">
                <h3 className="font-serif text-2xl text-bc-text-primary">{t(`categories.${key}.name`)}</h3>
                <Link
                  href={{ pathname: "/catalog", query: { cat: key } }}
                  aria-label={`${t("categoriesView")} ${t(`categories.${key}.name`)}`}
                  className={
                    "inline-flex items-center gap-2 text-sm text-bc-accent rounded-bc " +
                    "after:absolute after:inset-0 after:rounded-bc after:content-[''] " +
                    "focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-bc-accent focus-visible:after:ring-offset-4 focus-visible:after:ring-offset-bc-bg-base"
                  }
                >
                  <span className="underline decoration-bc-accent/30 underline-offset-4 transition-[text-decoration-color] duration-300 ease-bc group-hover:decoration-bc-accent">
                    {t("categoriesView")}
                  </span>
                  <span className="transition-transform duration-300 ease-bc group-hover:translate-x-1 motion-reduce:transition-none">
                    <ArrowIcon />
                  </span>
                </Link>
              </figcaption>
            </figure>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
