import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/motion/Reveal";

export async function CatalogEmpty({ query }: { query: string }) {
  const t = await getTranslations("catalog");

  return (
    <Reveal className="py-4 md:py-8 max-w-prose" variant="fade">
      <div role="status">
        <h2 className="font-serif text-2xl md:text-3xl text-bc-text-primary mb-4">
          {query ? t("noResultsTitle", { query }) : t("emptyTitle")}
        </h2>
        <p className="text-bc-text-secondary text-base mb-8">
          {query ? t("noResultsBody") : t("emptyBody")}
        </p>
        {query && (
          <Link
            href="/catalog"
            className="inline-flex items-center min-h-11 text-sm text-bc-accent underline underline-offset-4 hover:text-bc-accent-hover transition-colors duration-200 ease-bc"
          >
            {t("clearSearch")}
          </Link>
        )}
      </div>
    </Reveal>
  );
}
