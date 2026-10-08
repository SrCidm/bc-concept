import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const actionClasses =
  "inline-flex items-center justify-center min-h-11 px-5 rounded-bc border border-bc-accent text-sm text-bc-accent " +
  "transition-[color,background-color,transform] duration-200 ease-bc " +
  "hover-fine:bg-bc-accent hover-fine:text-bc-surface motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

/** Aviso permanente cuando el catálogo viene del mock (nunca del proveedor real). */
export function MockBanner() {
  const t = useTranslations("admin.import.mock");
  return (
    <div
      data-mock-banner
      className="mb-4 flex flex-col gap-0.5 rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-surface px-4 py-3 text-sm"
    >
      <p className="font-medium text-bc-text-primary">{t("title")}</p>
      <p className="text-bc-text-secondary">{t("body")}</p>
    </div>
  );
}

/** Sin resultados: con búsqueda de texto o solo por filtros. */
export function ImportEmpty({
  q,
  clearHref,
  nextHref,
}: {
  q: string;
  clearHref: string;
  /** Si hay más páginas y hay búsqueda de texto, ofrece seguir buscando. */
  nextHref: string | null;
}) {
  const t = useTranslations("admin.import.empty");
  return (
    <div className="flex flex-col items-start gap-4 rounded-bc border border-bc-border bg-bc-surface p-6 md:p-8">
      <div className="max-w-prose">
        <h2 className="font-serif text-xl text-bc-text-primary">{q ? t("searchTitle") : t("title")}</h2>
        <p className="mt-2 text-base text-bc-text-secondary">{q ? t("searchBody", { q }) : t("body")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {nextHref && (
          <Link href={nextHref} className={actionClasses}>
            {t("nextPage")}
          </Link>
        )}
        {(q || !nextHref) && (
          <Link href={clearHref} className={actionClasses}>
            {t("clear")}
          </Link>
        )}
      </div>
    </div>
  );
}

const KNOWN_CODES = [
  "not_configured",
  "unauthorized",
  "rate_limited",
  "timeout",
  "upstream",
  "bad_response",
  "invalid_request",
] as const;
type KnownCode = (typeof KNOWN_CODES)[number];
const isKnown = (c: string): c is KnownCode => (KNOWN_CODES as readonly string[]).includes(c);

/**
 * Error del proveedor por CÓDIGO (nunca por mensaje del proveedor). Reintentar es
 * un enlace normal (recarga completa) para saltarse la caché de navegación.
 */
export function ImportError({ code, retryHref, clearHref }: { code: string; retryHref: string; clearHref?: string }) {
  const t = useTranslations("admin.import.error");
  const key = isKnown(code) ? code : "generic";
  const retryable = code !== "not_configured" && code !== "invalid_request";

  return (
    <div role="alert" data-error-code={code} className="flex flex-col items-start gap-4 rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-surface p-6 md:p-8">
      <div className="max-w-prose">
        <h2 className="font-serif text-xl text-bc-text-primary">{t(`${key}.title`)}</h2>
        <p className="mt-2 text-base text-bc-text-secondary">{t(`${key}.body`)}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {retryable && (
          // <a> a propósito: recarga completa, sin la caché de navegación del router
          <a href={retryHref} className={actionClasses}>
            {t("retry")}
          </a>
        )}
        {code === "invalid_request" && clearHref && (
          <Link href={clearHref} className={actionClasses}>
            {t("clear")}
          </Link>
        )}
      </div>
    </div>
  );
}
