"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PRODUCT_TEXT_LIMITS as L, type AdminProductDetailDTO } from "@/lib/admin/products.types";
import { productApi, send } from "./api";
import { failureKey, FIELD } from "./fields";
import { formatWhen } from "./format";
import { CheckIcon, Spinner } from "./icons";
import { fieldError, hint, primaryButton, secondaryButton, sectionTitle, textarea } from "./ui";

/**
 * "Verificado con muestra": casilla + nota obligatoria (qué se comprobó). Guarda
 * quién y cuándo en el servidor. Solo en borradores; en un activo, de lectura.
 */
export function SamplePanel({ product, readOnly, onChanged }: { product: AdminProductDetailDTO; readOnly: boolean; onChanged: () => void }) {
  const t = useTranslations("admin.products.edit");
  const [checked, setChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesId = `${FIELD.sample}-notes`;
  const len = notes.trim().length;
  const notesValid = len >= L.sampleNotesMin && len <= L.sampleNotesMax;

  async function submit(verified: boolean) {
    if (verified && !notesValid) {
      setTouched(true);
      document.getElementById(notesId)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const r = await send("POST", productApi(product.id, "sample"), verified ? { verified, notes } : { verified });
    setBusy(false);
    if (r.ok) {
      setChecked(false);
      setNotes("");
      setTouched(false);
      onChanged();
    } else {
      setError(r.code);
    }
  }

  return (
    <section aria-labelledby="sample-title" className="flex flex-col gap-4">
      <h2 id="sample-title" className={sectionTitle}>
        {t("sample.title")}
      </h2>

      {product.sample ? (
        <div className="flex flex-col gap-3 rounded-bc border border-bc-border bg-bc-surface p-4">
          <p className="flex items-start gap-2 text-sm text-bc-text-primary">
            <CheckIcon className="mt-0.5 shrink-0 text-bc-success" />
            <span>
              {t("sample.verifiedBy", { who: product.sample.verifiedBy, date: formatWhen(product.sample.verifiedAt) })}
            </span>
          </p>
          <blockquote className="whitespace-pre-line border-l-2 border-bc-border pl-3 text-sm leading-relaxed text-bc-text-secondary">
            {product.sample.notes}
          </blockquote>
          {!readOnly && (
            <div>
              <button id={FIELD.sample} type="button" onClick={() => submit(false)} disabled={busy} className={secondaryButton}>
                {busy && <Spinner />}
                {busy ? t("sample.saving") : t("sample.remove")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-bc border border-bc-border bg-bc-surface p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-bc-text-primary">
            <input
              id={FIELD.sample}
              type="checkbox"
              checked={checked}
              disabled={readOnly || busy}
              onChange={(e) => {
                setChecked(e.target.checked);
                setError(null);
              }}
              aria-controls={notesId}
              aria-expanded={checked}
              className="h-[1.125rem] w-[1.125rem] shrink-0 cursor-pointer rounded-bc border-bc-border accent-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bc-surface disabled:cursor-not-allowed"
            />
            {t("sample.label")}
          </label>

          {checked ? (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor={notesId} className="text-sm text-bc-text-primary">
                    {t("sample.notesLabel")}
                  </label>
                  <span className="text-xs tabular-nums text-bc-text-secondary">{t("texts.counter", { n: len, max: L.sampleNotesMax })}</span>
                </div>
                <textarea
                  id={notesId}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={busy}
                  rows={4}
                  required
                  aria-invalid={touched && !notesValid}
                  aria-describedby={`${notesId}-hint`}
                  className={textarea}
                />
                <p id={`${notesId}-hint`} className={touched && !notesValid ? fieldError : hint}>
                  {touched && !notesValid ? t("sample.notesInvalid") : t("sample.notesHint")}
                </p>
              </div>
              <div>
                <button type="button" onClick={() => submit(true)} disabled={busy} aria-busy={busy} className={primaryButton}>
                  {busy && <Spinner />}
                  {busy ? t("sample.saving") : t("sample.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-bc-text-secondary">{t("sample.pending")}</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-bc-error">
          {t(`failures.${failureKey(error)}`)}
        </p>
      )}
    </section>
  );
}
