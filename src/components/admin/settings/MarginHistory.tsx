import { useTranslations } from "next-intl";
import { MARGIN_FIELDS, type MarginHistoryEntryDTO } from "@/lib/admin/settings.types";
import { formatFieldValue } from "./values";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d);
};

/** Historial de cambios (más reciente primero). Lo que cambió respecto al anterior va resaltado. Server Component. */
export function MarginHistory({ entries }: { entries: MarginHistoryEntryDTO[] }) {
  const t = useTranslations("admin.settings");

  return (
    <section aria-labelledby="margin-history-title" className="flex flex-col gap-3">
      <h2 id="margin-history-title" className="font-serif text-2xl text-bc-text-primary">
        {t("history.title")}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-bc-text-secondary">{t("history.empty")}</p>
      ) : (
        <>
          <p className="text-xs text-bc-text-secondary">{t("history.changedHint")}</p>
          <ol className="flex flex-col gap-3" data-history>
            {entries.map((e) => (
              <li key={e.id} className="rounded-bc border border-bc-border bg-bc-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-medium tabular-nums text-bc-text-primary">{formatWhen(e.createdAt)}</p>
                  <p className="truncate text-sm text-bc-text-secondary">{e.createdBy}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
                  {MARGIN_FIELDS.map((f) => {
                    const changed = e.changed.includes(f);
                    return (
                      <div
                        key={f}
                        data-changed={changed || undefined}
                        className={["rounded-bc px-2 py-1", changed ? "bg-bc-primary/10" : ""].join(" ")}
                      >
                        <dt className="text-xs text-bc-text-secondary">{t(`fields.${f}.label`)}</dt>
                        <dd className={["tabular-nums text-bc-text-primary", changed ? "font-medium" : ""].join(" ")}>
                          {formatFieldValue(f, e.values[f])}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {e.note && <p className="mt-3 text-sm text-bc-text-secondary">{t("status.note", { note: e.note })}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
