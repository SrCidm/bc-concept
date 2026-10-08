"use client";

import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/Container";

/** Boundary de último recurso. Mensaje genérico: nunca detalles internos. */
export default function CatalogRouteError({ reset }: { reset: () => void }) {
  const t = useTranslations("catalog");

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <Container>
        <div className="py-16 max-w-prose" role="alert">
          <h1 className="font-serif text-3xl text-bc-text-primary mb-3">
            {t("errorTitle")}
          </h1>
          <p className="text-bc-text-secondary text-base mb-6">{t("errorBody")}</p>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-bc-accent underline underline-offset-4 hover:text-bc-accent-hover transition-colors duration-200 ease-bc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
          >
            {t("retry")}
          </button>
        </div>
      </Container>
    </div>
  );
}
