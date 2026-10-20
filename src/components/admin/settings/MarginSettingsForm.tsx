"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  MARGIN_FIELDS,
  MARGIN_NOTE_MAX,
  MARGIN_RANGES,
  type MarginExampleDTO,
  type MarginField,
  type MarginSettingsPanelDTO,
  type MarginValuesDTO,
} from "@/lib/admin/settings.types";
import { formatMoney } from "@/components/admin/import/format";
import { formatDecimalInput, formatFieldValue, inRange, parseDecimalInput } from "./values";

const PREVIEW_URL = "/api/admin/settings/margin/preview";
const SAVE_URL = "/api/admin/settings/margin";
const DEBOUNCE_MS = 300;

const GROUPS: Array<{ key: "margin" | "costs" | "payments"; fields: MarginField[] }> = [
  { key: "margin", fields: ["targetMinPct", "targetMaxPct"] },
  { key: "costs", fields: ["shippingCost", "acquisitionCost", "returnsBufferPct"] },
  { key: "payments", fields: ["stripePct", "stripeFixed"] },
];

type Texts = Record<MarginField, string>;
type FieldError = "invalidNumber" | "invalid" | "invalidNote";

const eur = (n: number) => formatMoney({ amount: n, currency: "EUR" });
const pct = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: unknown; code?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, json, code: typeof code === "string" ? code : "storage_failed" };
  } catch {
    return { ok: false, json: null, code: "network" };
  }
}

const field =
  "min-h-11 w-full rounded-bc border bg-bc-bg-base px-3 text-base tabular-nums text-bc-text-primary " +
  "transition-[border-color,box-shadow] duration-200 ease-bc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent";

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-bc bg-bc-accent px-6 text-sm text-bc-surface " +
  "transition-[background-color,transform,opacity] duration-200 ease-bc hover-fine:bg-bc-accent-hover motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-bc border border-bc-accent px-5 text-sm text-bc-accent " +
  "transition-[color,background-color,transform] duration-200 ease-bc hover-fine:bg-bc-accent hover-fine:text-bc-surface motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

const toTexts = (v: MarginValuesDTO): Texts =>
  Object.fromEntries(MARGIN_FIELDS.map((f) => [f, formatDecimalInput(f, v[f])])) as Texts;

/**
 * Formulario de ajustes de margen. El cliente solo valida en superficie (para
 * avisar mientras se escribe) y MUESTRA lo que calcula el servidor: el ejemplo
 * en vivo viene de /preview y el guardado se vuelve a validar allí.
 */
export function MarginSettingsForm({
  initialValues,
  initialExample,
  vatPct,
  initiallyPersisted,
}: {
  initialValues: MarginValuesDTO;
  initialExample: MarginExampleDTO;
  vatPct: number;
  /** Ya hay ajustes guardados en la BD. Si no, se pueden guardar los actuales tal cual (punto de partida). */
  initiallyPersisted: boolean;
}) {
  const t = useTranslations("admin.settings");
  const router = useRouter();
  const uid = useId();

  const [baseline, setBaseline] = useState<MarginValuesDTO>(initialValues);
  const [persisted, setPersisted] = useState(initiallyPersisted);
  const [texts, setTexts] = useState<Texts>(() => toTexts(initialValues));
  const [touched, setTouched] = useState<Partial<Record<MarginField, boolean>>>({});
  const [serverFields, setServerFields] = useState<Array<MarginField | "note">>([]);
  const [note, setNote] = useState("");
  const [example, setExample] = useState<MarginExampleDTO>(initialExample);
  const [exampleFor, setExampleFor] = useState<string>(JSON.stringify(initialValues));
  const [phase, setPhase] = useState<"edit" | "confirm" | "saving">("edit");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const fieldRefs = useRef<Partial<Record<MarginField | "note", HTMLInputElement | null>>>({});

  // Valores escritos → números y errores de superficie.
  const parsed = useMemo(() => {
    const values = {} as MarginValuesDTO;
    const errors: Partial<Record<MarginField, FieldError>> = {};
    for (const f of MARGIN_FIELDS) {
      const n = parseDecimalInput(texts[f]);
      if (n === null) errors[f] = "invalidNumber";
      else if (!inRange(f, n)) errors[f] = "invalid";
      else values[f] = n;
    }
    if (!errors.targetMinPct && !errors.targetMaxPct && values.targetMaxPct < values.targetMinPct) {
      errors.targetMaxPct = "invalid";
    }
    for (const f of serverFields) if (f !== "note" && !errors[f]) errors[f] = "invalid";
    const valid = Object.keys(errors).length === 0;
    return { values: valid ? values : null, errors };
  }, [texts, serverFields]);

  const noteError = serverFields.includes("note") || note.length > MARGIN_NOTE_MAX;
  const changes = parsed.values ? MARGIN_FIELDS.filter((f) => parsed.values![f] !== baseline[f]) : [];
  // Sin nada guardado aún, guardar los valores actuales es válido: fija el punto de partida del historial.
  const canSave = parsed.values !== null && !noteError && (changes.length > 0 || !persisted);
  const key = parsed.values ? JSON.stringify(parsed.values) : null;
  const exampleFresh = key !== null && key === exampleFor;

  // Ejemplo en vivo (servidor), con debounce.
  useEffect(() => {
    if (!parsed.values || key === exampleFor) return;
    const id = ++reqRef.current;
    const values = parsed.values;
    const timer = setTimeout(async () => {
      const r = await post(PREVIEW_URL, values);
      if (id !== reqRef.current || !r.ok) return;
      setExample(r.json as MarginExampleDTO);
      setExampleFor(JSON.stringify(values));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, exampleFor, parsed.values]);

  useEffect(() => {
    if (phase === "confirm") confirmRef.current?.focus();
  }, [phase]);

  function onChange(f: MarginField, value: string) {
    setTexts((prev) => ({ ...prev, [f]: value }));
    setTouched((prev) => ({ ...prev, [f]: true }));
    setServerFields((prev) => prev.filter((x) => x !== f));
    setSaved(false);
    setError(null);
    if (phase === "confirm") setPhase("edit");
  }

  async function onConfirm() {
    if (!parsed.values) return;
    setPhase("saving");
    setError(null);
    const r = await post(SAVE_URL, { ...parsed.values, note: note.trim() === "" ? null : note });
    if (r.ok) {
      const panel = r.json as MarginSettingsPanelDTO;
      setBaseline(panel.values);
      setPersisted(panel.origin === "db");
      setTexts(toTexts(panel.values));
      setTouched({});
      setNote("");
      setExample(panel.example);
      setExampleFor(JSON.stringify(panel.values));
      setPhase("edit");
      setSaved(true);
      router.refresh(); // cabecera de estado e historial (Server Components)
      return;
    }
    const fields = (r.json as { error?: { fields?: unknown } } | null)?.error?.fields;
    const list = Array.isArray(fields) ? (fields.filter((x) => typeof x === "string") as Array<MarginField | "note">) : [];
    setServerFields(list);
    setTouched(Object.fromEntries(MARGIN_FIELDS.map((f) => [f, true])));
    setError(r.code ?? "storage_failed");
    setPhase("edit");
    const first = list[0];
    if (first) fieldRefs.current[first]?.focus();
  }

  const rangeText = (f: MarginField) => {
    const r = MARGIN_RANGES[f];
    return f === "targetMaxPct"
      ? t("rangeTarget", { max: formatFieldValue(f, r.max) })
      : t("range", { min: formatFieldValue(f, r.min), max: formatFieldValue(f, r.max) });
  };

  const errorKnown = (code: string) =>
    ["invalid_request", "storage_failed", "unauthenticated", "forbidden", "network"].includes(code) ? code : "storage_failed";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) setPhase("confirm");
        }}
        className="flex flex-col gap-8"
      >
        {GROUPS.map((g) => (
          <fieldset key={g.key} className="flex flex-col gap-5 rounded-bc border border-bc-border bg-bc-surface p-5">
            <legend className="px-1 font-sans text-sm font-medium text-bc-text-primary">{t(`groups.${g.key}`)}</legend>
            {g.fields.map((f) => {
              const id = `${uid}-${f}`;
              const err = touched[f] || serverFields.includes(f) ? parsed.errors[f] : undefined;
              return (
                <div key={f} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start sm:gap-x-6">
                  <div>
                    <label htmlFor={id} className="block text-sm font-medium text-bc-text-primary">
                      {t(`fields.${f}.label`)}
                    </label>
                    <p id={`${id}-help`} className="mt-0.5 text-sm text-bc-text-secondary">
                      {t(`fields.${f}.help`)}
                    </p>
                  </div>
                  <div>
                    <div className="relative">
                      <input
                        ref={(el) => {
                          fieldRefs.current[f] = el;
                        }}
                        id={id}
                        name={f}
                        inputMode="decimal"
                        autoComplete="off"
                        value={texts[f]}
                        disabled={phase === "saving"}
                        onChange={(e) => onChange(f, e.target.value)}
                        onBlur={() => setTouched((prev) => ({ ...prev, [f]: true }))}
                        aria-invalid={Boolean(err)}
                        aria-describedby={`${id}-help ${id}-range${err ? ` ${id}-err` : ""}`}
                        className={`${field} pr-9 ${err ? "border-bc-error" : "border-bc-border focus-visible:border-bc-accent"} ${changes.includes(f) ? "font-medium" : ""}`}
                      />
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-bc-text-secondary">
                        {MARGIN_RANGES[f].unit}
                      </span>
                    </div>
                    <p id={`${id}-range`} className="mt-1 text-xs text-bc-text-secondary">
                      {rangeText(f)}
                    </p>
                    {err && (
                      <p id={`${id}-err`} className="mt-1 text-xs text-bc-error" data-field-error={f}>
                        {err === "invalidNumber" ? t("invalidNumber") : t("invalid")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </fieldset>
        ))}

        <fieldset className="flex flex-col gap-5 rounded-bc border border-bc-border bg-bc-surface p-5">
          <legend className="px-1 font-sans text-sm font-medium text-bc-text-primary">{t("groups.taxes")}</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:gap-x-6">
            <div>
              <p className="text-sm font-medium text-bc-text-primary">{t("fields.vat.label")}</p>
              <p className="mt-0.5 text-sm text-bc-text-secondary">{t("fields.vat.help")}</p>
            </div>
            <p data-vat className="flex min-h-11 items-center rounded-bc border border-dashed border-bc-border px-3 text-base tabular-nums text-bc-text-primary">
              {vatPct}&nbsp;%
            </p>
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-bc-text-primary">
            {t("fields.note.label")}
          </label>
          <p id={`${uid}-note-help`} className="mt-0.5 text-sm text-bc-text-secondary">
            {t("fields.note.help")}
          </p>
          <input
            ref={(el) => {
              fieldRefs.current.note = el;
            }}
            id={`${uid}-note`}
            name="note"
            value={note}
            maxLength={MARGIN_NOTE_MAX}
            disabled={phase === "saving"}
            onChange={(e) => {
              setNote(e.target.value);
              setServerFields((prev) => prev.filter((x) => x !== "note"));
            }}
            aria-invalid={noteError}
            aria-describedby={`${uid}-note-help`}
            className={`${field} mt-1.5 ${noteError ? "border-bc-error" : "border-bc-border focus-visible:border-bc-accent"}`}
          />
          {noteError && <p className="mt-1 text-xs text-bc-error">{t("invalidNote")}</p>}
        </div>

        {error && phase === "edit" && (
          <p role="alert" data-error-code={error} className="rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-surface px-4 py-3 text-sm text-bc-text-primary">
            {t(`errors.${errorKnown(error)}`)}
          </p>
        )}
        {saved && phase === "edit" && (
          <p role="status" data-saved className="rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-surface px-4 py-3 text-sm text-bc-text-primary">
            {t("saved")}
          </p>
        )}

        {phase === "edit" ? (
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={!canSave} className={primaryButton}>
              {t("save")}
            </button>
            {parsed.values && changes.length === 0 && persisted && !saved && (
              <span className="text-sm text-bc-text-secondary">{t("noChanges")}</span>
            )}
          </div>
        ) : (
          <section aria-labelledby={`${uid}-confirm`} data-confirm className="flex flex-col gap-4 rounded-bc border border-bc-accent bg-bc-surface p-5">
            <h2 id={`${uid}-confirm`} ref={confirmRef} tabIndex={-1} className="font-sans text-base font-medium text-bc-text-primary focus:outline-none">
              {t("confirm.title")}
            </h2>
            <p className="text-sm text-bc-text-secondary">{changes.length > 0 ? t("confirm.body") : t("confirm.initial")}</p>
            <ul className="flex flex-col gap-1.5 text-sm tabular-nums text-bc-text-primary">
              {changes.map((f) => (
                <li key={f}>
                  {t("confirm.change", {
                    field: t(`fields.${f}.label`),
                    from: formatFieldValue(f, baseline[f]),
                    to: formatFieldValue(f, parsed.values![f]),
                  })}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onConfirm} disabled={phase === "saving"} className={primaryButton}>
                {phase === "saving" ? t("confirm.saving") : t("confirm.submit")}
              </button>
              <button type="button" onClick={() => setPhase("edit")} disabled={phase === "saving"} className={secondaryButton}>
                {t("confirm.back")}
              </button>
            </div>
          </section>
        )}
      </form>

      <aside aria-label={t("example.title")} data-example className="rounded-bc border border-bc-border bg-bc-surface p-5 lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-sans text-sm font-medium text-bc-text-primary">{t("example.title")}</h2>
          {changes.length > 0 && (
            <span className="rounded-bc border border-bc-border px-2 py-0.5 text-xs text-bc-text-secondary">{t("example.unsaved")}</span>
          )}
        </div>
        <div aria-live="polite" aria-busy={!exampleFresh && parsed.values !== null} className={!exampleFresh ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>
          <p className="mt-3 text-base text-bc-text-primary">
            {example.minPrice !== null
              ? t("example.body", { cost: eur(example.cost), price: eur(example.minPrice) })
              : t("example.unreachable")}
          </p>
          {example.breakdown && (
            <dl className="mt-4 text-sm tabular-nums">
              {(
                [
                  ["price", eur(example.breakdown.price)],
                  ["vat", `− ${eur(example.breakdown.vat)}`],
                  ["net", eur(example.breakdown.netRevenue)],
                  ["cost", `− ${eur(example.breakdown.cost)}`],
                  ["shipping", `− ${eur(example.breakdown.shipping)}`],
                  ["stripe", `− ${eur(example.breakdown.stripeFee)}`],
                  ["returns", `− ${eur(example.breakdown.returnsBuffer)}`],
                  ...(example.breakdown.acquisition > 0 ? [["acquisition", `− ${eur(example.breakdown.acquisition)}`]] : []),
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-bc-border py-1.5">
                  <dt className="text-bc-text-secondary">{t(`example.rows.${k}`)}</dt>
                  <dd className="text-bc-text-primary">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 pt-2">
                <dt className="font-medium text-bc-text-primary">{t("example.rows.margin")}</dt>
                <dd className="font-medium text-bc-text-primary">
                  {eur(example.breakdown.netMargin)} · {pct.format(example.breakdown.netMarginPct)}&nbsp;%
                </dd>
              </div>
            </dl>
          )}
          {parsed.values !== null && !exampleFresh && <p className="mt-3 text-xs text-bc-text-secondary">{t("example.calculating")}</p>}
        </div>
      </aside>
    </div>
  );
}
