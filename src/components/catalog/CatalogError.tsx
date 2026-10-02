import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Generic error: never exposes internal details (regla #8). */
export async function CatalogError({ query }: { query: string }) {
  const t = await getTranslations("catalog");
  const href = query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog";

  return (
    <div className="py-16 max-w-prose" role="alert">
      <h2 className="font-serif text-2xl text-bc-text-primary mb-3">
        {t("errorTitle")}
      </h2>
      <p className="text-bc-text-secondary text-base mb-6">{t("errorBody")}</p>
      <Link
        href={href}
        className="text-sm text-bc-accent underline underline-offset-4 hover:text-bc-accent-hover transition-colors duration-200 ease-bc"
      >
        {t("retry")}
      </Link>
    </div>
  );
}
