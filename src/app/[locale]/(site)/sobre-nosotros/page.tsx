import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Sobre nosotros (SSG). URL localizada: /sobre-nosotros · /en/about.
 * El copy es un BORRADOR pendiente de revisión (ver CLAUDE.md): sin años, cifras
 * ni promesas que no podamos cumplir.
 */
export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "about" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const VALUES = [
  { title: "curationTitle", body: "curationBody" },
  { title: "aestheticTitle", body: "aestheticBody" },
  { title: "europeTitle", body: "europeBody" },
] as const;

export default async function AboutPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations("about");

  return (
    <div className="pt-28 md:pt-36 pb-24 md:pb-32">
      <Container>
        <header className="max-w-3xl mb-16 md:mb-24">
          <Reveal
            as="h1"
            variant="lines"
            className="font-serif text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1.05] tracking-[-0.01em] text-bc-text-primary mb-6"
          >
            {t("title")}
          </Reveal>
          <Reveal delay={0.15}>
            <p className="font-serif italic text-[clamp(1.375rem,2.4vw,1.875rem)] leading-snug text-bc-accent mb-8">
              {t("tagline")}
            </p>
            <p className="text-bc-text-secondary text-lg leading-relaxed max-w-prose">{t("intro")}</p>
          </Reveal>
        </header>

        <section aria-labelledby="about-values" className="border-t border-bc-border pt-10 md:pt-14 mb-16 md:mb-24">
          <h2 id="about-values" className="font-sans text-xs tracking-widest uppercase text-bc-text-secondary mb-10">
            {t("valuesLabel")}
          </h2>
          <Reveal items className="grid gap-10 md:grid-cols-3 md:gap-12">
            {VALUES.map((v) => (
              <div key={v.title} data-reveal-item className="gsap-init">
                <h3 className="font-serif text-2xl text-bc-text-primary mb-3">{t(v.title)}</h3>
                <p className="text-bc-text-secondary leading-relaxed">{t(v.body)}</p>
              </div>
            ))}
          </Reveal>
        </section>

        <Reveal variant="fade" className="max-w-prose">
          <p className="text-bc-text-primary text-lg leading-relaxed mb-10">{t("closing")}</p>
          <Button href="/catalog" variant="outline">
            {t("cta")}
          </Button>
        </Reveal>
      </Container>
    </div>
  );
}
