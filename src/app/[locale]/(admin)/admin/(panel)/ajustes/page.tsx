import { getTranslations } from "next-intl/server";
import { getMarginSettingsPanel } from "@/lib/admin/marginSettings";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { MarginHistory, formatWhen } from "@/components/admin/settings/MarginHistory";
import { MarginSettingsForm } from "@/components/admin/settings/MarginSettingsForm";

export const dynamic = "force-dynamic";

/**
 * Ajustes de margen (Yosra). La página se protege a sí misma y los datos los da
 * `getMarginSettingsPanel`, que vuelve a exigir la sesión.
 */
export default async function AdminSettingsPage() {
  await requireAdminPage(); // cada página se protege a sí misma (ver layout)
  const t = await getTranslations("admin.settings");
  const result = await getMarginSettingsPanel();
  if (!result.ok) {
    await requireAdminPage(); // la sesión caducó entre medias: redirige al login
    return null;
  }
  const panel = result.data;

  const status =
    panel.origin === "db" && panel.savedAt && panel.savedBy
      ? t("status.db", { date: formatWhen(panel.savedAt), who: panel.savedBy })
      : panel.origin === "env"
        ? t("status.env")
        : t("status.defaults");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-serif text-3xl text-bc-text-primary md:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-base text-bc-text-secondary">{t("intro")}</p>
      </header>

      <div className="flex flex-col gap-3">
        {panel.storage === "memory" && (
          <p data-memory-note className="rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-surface px-4 py-3 text-sm text-bc-text-secondary">
            {t("status.memory")}
          </p>
        )}
        {panel.degraded ? (
          <p role="alert" data-degraded className="rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-surface px-4 py-3 text-sm text-bc-text-primary">
            {t("status.degraded")}
          </p>
        ) : (
          <p data-origin={panel.origin} className="text-sm text-bc-text-secondary">
            {status}
            {panel.origin === "db" && panel.note ? ` ${t("status.note", { note: panel.note })}` : ""}
          </p>
        )}
      </div>

      <MarginSettingsForm
        initialValues={panel.values}
        initialExample={panel.example}
        vatPct={panel.vatPct}
        initiallyPersisted={panel.origin === "db" && !panel.degraded}
      />

      <MarginHistory entries={panel.history} />
    </div>
  );
}
