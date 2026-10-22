import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { contactEmail } from "@/lib/contact";

/**
 * Contacto (SSG). URL localizada: /contacto · /en/contact. Sin formulario: el
 * email sale de `CONTACT_EMAIL` (leída en el build). Sin variable válida, la
 * página lo dice y no muestra ningún email.
 */
export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "contact" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ContactPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations("contact");
  const email = contactEmail();

  return (
    <div className="pt-28 md:pt-36 pb-24 md:pb-32">
      <Container>
        <header className="max-w-3xl mb-12 md:mb-16">
          <Reveal
            as="h1"
            variant="lines"
            className="font-serif text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1.05] tracking-[-0.01em] text-bc-text-primary mb-6"
          >
            {t("title")}
          </Reveal>
          <Reveal delay={0.15}>
            <p className="text-bc-text-secondary text-lg leading-relaxed max-w-prose">{t("intro")}</p>
          </Reveal>
        </header>

        <Reveal variant="fade" className="max-w-xl">
          <div className="bg-bc-surface border border-bc-border rounded-bc p-8 md:p-10">
            {email ? (
              <>
                <p className="font-sans text-xs tracking-widest uppercase text-bc-text-secondary mb-3">
                  {t("emailLabel")}
                </p>
                <a
                  href={`mailto:${email}`}
                  className={
                    "font-serif text-[clamp(1.375rem,3vw,1.875rem)] text-bc-accent break-all " +
                    "underline decoration-bc-accent/30 underline-offset-[6px] hover:decoration-bc-accent " +
                    "transition-[text-decoration-color] duration-200 ease-bc rounded-bc " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-4"
                  }
                >
                  {email}
                </a>
                <p className="text-bc-text-secondary mt-6">{t("responseTime")}</p>
              </>
            ) : (
              <>
                <p className="text-bc-text-primary text-lg mb-2">{t("unavailable")}</p>
                <p className="text-bc-text-secondary mb-8">{t("collectionPrompt")}</p>
                <Button href="/catalog" variant="outline">
                  {t("cta")}
                </Button>
              </>
            )}
          </div>
        </Reveal>
      </Container>
    </div>
  );
}
