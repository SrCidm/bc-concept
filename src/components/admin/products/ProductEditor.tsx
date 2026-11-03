"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { STORE_CATEGORIES, isStoreCategory, type ImportShippingDTO, type StoreCategory } from "@/lib/admin/import.types";
import { PRODUCT_TEXT_LIMITS as L, type AdminProductDetailDTO, type MarginTodayDTO } from "@/lib/admin/products.types";
import { formatMoney } from "@/components/admin/import/format";
import { MarginBreakdown } from "@/components/admin/import/MarginBreakdown";
import { formatPriceInput, parsePriceInput } from "@/components/admin/import/price";
import { productApi, send } from "./api";
import { failureKey, FIELD, goToField } from "./fields";
import { pct } from "./format";
import { Spinner } from "./icons";
import { field, fieldError, label, noteError, noteInfo, primaryButton, secondaryButton, sectionTitle, textarea } from "./ui";

const DEBOUNCE_MS = 300;

interface Values {
  title: string;
  description: string;
  titleEn: string;
  descriptionEn: string;
  category: StoreCategory | "";
  price: string;
}

const fromProduct = (p: AdminProductDetailDTO): Values => ({
  title: p.title,
  description: p.description ?? "",
  titleEn: p.titleEn ?? "",
  descriptionEn: p.descriptionEn ?? "",
  category: p.category ?? "",
  price: formatPriceInput(p.priceRetail),
});

type FieldKey = "title" | "titleEn" | "description" | "descriptionEn" | "price";

/** La misma validación que el servidor (que vuelve a hacerla): aquí solo para avisar antes. */
function validate(v: Values): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const len = (s: string) => s.trim().length;
  if (len(v.title) < L.titleMin || len(v.title) > L.titleMax) errors.title = "title";
  if (len(v.titleEn) > 0 && (len(v.titleEn) < L.titleMin || len(v.titleEn) > L.titleMax)) errors.titleEn = "titleEn";
  if (len(v.description) > L.descriptionMax) errors.description = "description";
  if (len(v.descriptionEn) > L.descriptionMax) errors.descriptionEn = "description";
  if (parsePriceInput(v.price) === null) errors.price = "price";
  return errors;
}

const FIELD_ID: Record<FieldKey, string> = {
  title: FIELD.title,
  titleEn: FIELD.titleEn,
  description: FIELD.description,
  descriptionEn: FIELD.descriptionEn,
  price: FIELD.price,
};

/**
 * Textos ES/EN, categoría y PVP de un borrador. El margen lo calcula SIEMPRE el
 * servidor (al escribir el PVP, con debounce). Un activo se muestra de solo
 * lectura. Al guardar, la página se vuelve a pedir al servidor y este editor se
 * monta de nuevo con lo guardado (key = updatedAt).
 */
export function ProductEditor({
  product,
  readOnly,
  saved,
  onDirtyChange,
  onSaved,
}: {
  product: AdminProductDetailDTO;
  readOnly: boolean;
  /** Se acaba de guardar (el aviso sobrevive al remontaje). */
  saved: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.products.edit");
  const cat = useTranslations("admin.import.dialog.category");
  const errorsId = useId();
  const initial = useMemo(() => fromProduct(product), [product]);
  const [v, setV] = useState<Values>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [margin, setMargin] = useState<MarginTodayDTO>(product.margin);
  const [checking, setChecking] = useState(false);
  const reqRef = useRef(0);

  const dirty = (Object.keys(v) as (keyof Values)[]).some((k) => v[k] !== initial[k]);
  useEffect(() => onDirtyChange(dirty && !readOnly), [dirty, readOnly, onDirtyChange]);

  const errors = validate(v);
  const visibleErrors = showErrors ? errors : {};
  const price = parsePriceInput(v.price);

  // Guarda en vivo: el servidor recalcula con el PVP escrito (coste y flete guardados, tipo y ajustes de hoy).
  useEffect(() => {
    if (readOnly || price === null) return;
    if (price === product.priceRetail) {
      setMargin(product.margin);
      setChecking(false);
      return;
    }
    const id = ++reqRef.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      const r = await send("POST", productApi(product.id, "margin"), { priceRetail: price });
      if (id !== reqRef.current) return;
      setChecking(false);
      if (r.ok) setMargin(r.body as MarginTodayDTO);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [price, readOnly, product.id, product.priceRetail, product.margin]);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV((prev) => ({ ...prev, [k]: value }));
    setSaveError(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || saving || !dirty) return;
    const first = (Object.keys(FIELD_ID) as FieldKey[]).find((k) => errors[k]);
    if (first) {
      setShowErrors(true);
      goToField(FIELD_ID[first]);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const r = await send("PATCH", productApi(product.id), {
      title: v.title,
      description: v.description,
      titleEn: v.titleEn,
      descriptionEn: v.descriptionEn,
      category: v.category === "" ? null : v.category,
      priceRetail: price,
    });
    setSaving(false);
    if (r.ok) onSaved();
    else setSaveError(r.code);
  }

  const shipping: ImportShippingDTO | null =
    margin.realShipping && margin.check && product.shippingMethod && product.warehouse
      ? {
          cost: margin.check.shipping,
          method: product.shippingMethod,
          origin: product.warehouse,
          minDays: product.deliveryMinDays,
          maxDays: product.deliveryMaxDays,
        }
      : null;
  const fresh = margin.check !== null && margin.check.price === price && !checking;

  const textField = (
    k: "title" | "titleEn",
    labelText: string,
    optional = false
  ) => {
    const errId = `${FIELD_ID[k]}-error`;
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={FIELD_ID[k]} className="text-sm text-bc-text-primary">
            {labelText}
          </label>
          <span className="text-xs tabular-nums text-bc-text-secondary">{t("texts.counter", { n: v[k].trim().length, max: L.titleMax })}</span>
        </div>
        <input
          id={FIELD_ID[k]}
          name={k}
          value={v[k]}
          onChange={(e) => set(k, e.target.value)}
          disabled={readOnly || saving}
          maxLength={L.titleMax + 20}
          autoComplete="off"
          required={!optional}
          aria-invalid={Boolean(visibleErrors[k])}
          aria-describedby={visibleErrors[k] ? errId : undefined}
          className={field}
        />
        {visibleErrors[k] && (
          <p id={errId} className={fieldError}>
            {t(`validation.${visibleErrors[k]}`)}
          </p>
        )}
      </div>
    );
  };

  const descriptionField = (k: "description" | "descriptionEn", labelText: string) => {
    const errId = `${FIELD_ID[k]}-error`;
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={FIELD_ID[k]} className="text-sm text-bc-text-primary">
            {labelText}
          </label>
          <span className="text-xs tabular-nums text-bc-text-secondary">
            {t("texts.counter", { n: v[k].trim().length, max: L.descriptionMax })}
          </span>
        </div>
        <textarea
          id={FIELD_ID[k]}
          name={k}
          value={v[k]}
          onChange={(e) => set(k, e.target.value)}
          disabled={readOnly || saving}
          rows={6}
          aria-invalid={Boolean(visibleErrors[k])}
          aria-describedby={visibleErrors[k] ? errId : undefined}
          className={textarea}
        />
        {visibleErrors[k] && (
          <p id={errId} className={fieldError}>
            {t(`validation.${visibleErrors[k]}`)}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={saveError ? errorsId : undefined} className="flex flex-col gap-10">
      {readOnly && <p className={`${noteInfo} text-bc-text-primary`}>{t("readOnly")}</p>}

      <section aria-labelledby="texts-title" className="flex flex-col gap-6">
        <h2 id="texts-title" className={sectionTitle}>
          {t("texts.title")}
        </h2>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-bc-text-primary">
            {t("texts.es")}
            <span className="font-normal text-bc-text-secondary">{t("texts.esHint")}</span>
          </legend>
          {textField("title", t("texts.titleLabel"))}
          {descriptionField("description", t("texts.descriptionLabel"))}
        </fieldset>

        <details className="group rounded-bc border border-bc-border bg-bc-bg-base">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-bc px-4 text-sm text-bc-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent [&::-webkit-details-marker]:hidden">
            <span>
              {t("texts.supplier")}
              <span className="ml-2 text-bc-text-secondary">{t("texts.supplierHint")}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-bc-text-secondary transition-transform duration-200 ease-bc group-open:rotate-180">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div lang="en" className="flex flex-col gap-2 border-t border-bc-border px-4 py-3 text-sm">
            <p className="font-medium text-bc-text-primary">{product.supplierTitle ?? "—"}</p>
            <p className="max-h-48 overflow-y-auto whitespace-pre-line leading-relaxed text-bc-text-secondary">
              {product.supplierDescription ?? t("texts.supplierEmpty")}
            </p>
          </div>
        </details>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-bc-text-primary">
            {t("texts.en")}
            <span className="font-normal text-bc-text-secondary">{t("texts.enHint")}</span>
          </legend>
          {textField("titleEn", t("texts.titleEnLabel"), true)}
          {descriptionField("descriptionEn", t("texts.descriptionEnLabel"))}
        </fieldset>
      </section>

      <section aria-labelledby="pricing-title" className="flex flex-col gap-6">
        <h2 id="pricing-title" className={sectionTitle}>
          {t("pricing.title")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={FIELD.category} className={label}>
              {t("pricing.category")}
            </label>
            <select
              id={FIELD.category}
              name="category"
              value={v.category}
              disabled={readOnly || saving}
              onChange={(e) => set("category", isStoreCategory(e.target.value) ? e.target.value : "")}
              className={field}
            >
              <option value="">{cat("none")}</option>
              {STORE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {cat(`options.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={FIELD.price} className={label}>
              {t("pricing.price")}
            </label>
            <div className="relative">
              <input
                id={FIELD.price}
                name="priceRetail"
                inputMode="decimal"
                autoComplete="off"
                value={v.price}
                disabled={readOnly || saving}
                onChange={(e) => set("price", e.target.value)}
                aria-invalid={v.price !== "" && price === null}
                aria-describedby={v.price !== "" && price === null ? `${FIELD.price}-error` : undefined}
                className={`${field} pr-9 tabular-nums`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-bc-text-secondary">
                €
              </span>
            </div>
            {v.price !== "" && price === null && (
              <p id={`${FIELD.price}-error`} className={fieldError}>
                {t("validation.price")}
              </p>
            )}
          </div>
        </div>

        <div aria-labelledby="margin-today-title" role="group" className="flex flex-col gap-3 rounded-bc border border-bc-border bg-bc-surface p-4 md:p-5">
          <h3 id="margin-today-title" className="font-sans text-sm font-medium text-bc-text-primary">
            {t("pricing.marginTitle")}
          </h3>
          {margin.check ? (
            <>
              <MarginBreakdown check={margin.check} stale={!fresh} costVaries={false} fx={margin.fx} shipping={shipping} />
              {fresh && !margin.check.belowMin && (
                <p role="status" className="text-sm text-bc-text-secondary">
                  {t("pricing.ok", { pct: pct(margin.check.netMarginPct), min: pct(margin.check.minPct) })}
                </p>
              )}
              {fresh && margin.check.belowMin && (
                <div role="alert" className={`${noteError} flex flex-col gap-2 text-bc-text-primary`}>
                  <p className="font-medium text-bc-error">{t("pricing.below", { min: pct(margin.check.minPct) })}</p>
                  {margin.check.minPrice !== null ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <p className="tabular-nums">{t("pricing.minPrice", { price: formatMoney({ amount: margin.check.minPrice, currency: "EUR" }) })}</p>
                      {!readOnly && (
                        <button type="button" onClick={() => set("price", formatPriceInput(margin.check!.minPrice as number))} className={secondaryButton}>
                          {t("pricing.useMin")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p>{t("pricing.unreachable")}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p role="status" className="text-sm text-bc-text-secondary">
              {checking ? t("pricing.calculating") : margin.reason === "fx_unavailable" ? t("pricing.noFx") : t("pricing.invalid")}
            </p>
          )}
          <p className="text-xs leading-relaxed text-bc-text-secondary">
            {t("pricing.note")}
            {!margin.realShipping && ` ${t("pricing.noteAverage")}`}
          </p>
        </div>
      </section>

      {!readOnly && (
        <div
          className={[
            "z-10 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 rounded-bc border border-bc-border px-4 py-3",
            // Fija abajo solo con cambios sin guardar; sin cambios, se queda al final del formulario.
            dirty ? "sticky bottom-3 bg-bc-surface/95 shadow-premium backdrop-blur-sm" : "bg-bc-surface",
          ].join(" ")}
        >
          <p role="status" aria-live="polite" className="mr-auto text-sm text-bc-text-secondary">
            {saving ? t("save.saving") : dirty ? t("save.dirty") : saved ? t("save.saved") : t("save.clean")}
          </p>
          {saveError && (
            <p id={errorsId} role="alert" className="w-full text-sm text-bc-error sm:order-first sm:w-auto">
              {t(`failures.${failureKey(saveError)}`)}
            </p>
          )}
          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setV(initial);
                setShowErrors(false);
                setSaveError(null);
              }}
              className={secondaryButton}
            >
              {t("save.discardChanges")}
            </button>
          )}
          <button type="submit" disabled={!dirty || saving} aria-busy={saving} className={primaryButton}>
            {saving && <Spinner />}
            {saving ? t("save.saving") : t("save.button")}
          </button>
        </div>
      )}
    </form>
  );
}
