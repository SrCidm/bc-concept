import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

/**
 * Importación desde BigBuy. Fase 3.2a/A: solo el cromo y la guarda; el buscador
 * y el grid llegan en las fases B y C.
 */
export default async function AdminImportPage() {
  await requireAdminPage(); // cada página se protege a sí misma (ver layout)
  const t = await getTranslations("admin.import");

  return (
    <div>
      <h1 className="font-serif text-3xl md:text-4xl text-bc-text-primary mb-3">
        {t("title")}
      </h1>
      <p className="text-bc-text-secondary text-base max-w-prose">{t("stub")}</p>
    </div>
  );
}
