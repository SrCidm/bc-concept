"use client";

import { useTranslations } from "next-intl";

/**
 * Último recurso del panel: un fallo no previsto al renderizar. No muestra el
 * mensaje del error (puede llevar detalles internos; regla #8). El `digest` es
 * lo único que ayuda a localizarlo en los logs del servidor.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("admin.import.boundary");
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-surface p-6 md:p-8">
      <div className="max-w-prose">
        <h1 className="font-serif text-2xl text-bc-text-primary">{t("title")}</h1>
        <p className="mt-2 text-base text-bc-text-secondary">{t("body")}</p>
        {error.digest && <p className="mt-3 text-xs tabular-nums text-bc-text-secondary">ref. {error.digest}</p>}
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center justify-center rounded-bc border border-bc-accent px-5 text-sm text-bc-accent transition-[color,background-color,transform] duration-200 ease-bc hover-fine:bg-bc-accent hover-fine:text-bc-surface motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
      >
        {t("retry")}
      </button>
    </div>
  );
}
