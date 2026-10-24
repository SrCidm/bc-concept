import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import storyImage from "../../../public/images/about/sobre-nosotros.jpg";

/**
 * Bloque de marca de la home (Server Component): imagen + presentación breve y
 * enlace a Sobre nosotros. La imagen va en su proporción natural (ancho 100 %,
 * alto automático, leída del archivo en el build): sustituirla no exige cambios.
 * Copy: el mismo borrador de Sobre nosotros (ver CLAUDE.md).
 */
export async function HomeStory() {
  const t = await getTranslations("home");

  return (
    <section className="pb-24 md:pb-36">
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12 lg:gap-16">
          <Reveal variant="fade" className="md:col-span-7">
            <div className="overflow-hidden rounded-bc bg-bc-primary/15">
              <Image
                src={storyImage}
                alt={t("storyAlt")}
                sizes="(min-width: 1180px) 640px, (min-width: 768px) 58vw, 100vw"
                quality={75}
                className="h-auto w-full"
              />
            </div>
          </Reveal>
          <div className="md:col-span-5">
            <Reveal
              as="h2"
              variant="lines"
              className="font-serif text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] tracking-[-0.01em] text-bc-text-primary mb-6"
            >
              {t("storyTitle")}
            </Reveal>
            <Reveal delay={0.1}>
              <p className="text-bc-text-secondary text-lg leading-relaxed mb-10 max-w-prose">{t("storyBody")}</p>
              <Button href="/sobre-nosotros" variant="outline">
                {t("storyCta")}
              </Button>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
