import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function CatalogEmpty({ query }: { query: string }) {
  const t = await getTranslations("catalog");

  return (
    <div className="py-16 max-w-prose" role="status">
      <h2 className="font-serif text-2xl text-bc-text-primary mb-3">
        {query ? t("noResultsTitle", { query }) : t("emptyTitle")}
      </h2>
      <p className="text-bc-text-secondary text-base mb-6">
        {query ? t("noResultsBody") : t("emptyBody")}
      </p>
      {query && (
        <Link
          href="/catalog"
          className="text-sm text-bc-accent underline underline-offset-4 hover:text-bc-accent-hover transition-colors duration-200 ease-bc"
        >
          {t("clearSearch")}
        </Link>
      )}
    </div>
  );
}
