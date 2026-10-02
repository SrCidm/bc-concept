import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";

export default async function CatalogPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <Container>
        <h1 className="font-serif text-4xl md:text-5xl text-bc-text-primary mb-6">
          {t("collection")}
        </h1>
        <p className="text-bc-text-secondary text-lg">
          Próximamente descubriremos nuestra colección.
        </p>
      </Container>
    </div>
  );
}
