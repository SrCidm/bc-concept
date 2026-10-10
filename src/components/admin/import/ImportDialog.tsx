"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IMPORT_ERROR_STATUS,
  STORE_CATEGORIES,
  isStoreCategory,
  type ImportPreviewDTO,
  type ImportResultDTO,
  type MarginCheckDTO,
  type StoreCategory,
} from "@/lib/admin/import.types";
import { costHeaderText } from "./costDisplay";
import { formatInt, formatMoney } from "./format";
import { MarginBreakdown, formatPct } from "./MarginBreakdown";
import { formatPriceInput, parsePriceInput } from "./price";
import { ProductThumb } from "./ProductThumb";

const PREVIEW_URL = "/api/admin/suppliers/bigbuy/import/preview";
const SAVE_URL = "/api/admin/suppliers/bigbuy/import";
const DEBOUNCE_MS = 300;
/** Errores transitorios: reintentar puede funcionar. El resto (no UE, moneda, clave…) no se arregla reintentando. */
const RETRYABLE = new Set(["rate_limited", "timeout", "upstream", "bad_response", "network", "storage_failed"]);

interface ApiReply {
  ok: boolean;
  /** Código de error (solo si !ok). */
  code?: string;
  json?: unknown;
}

/** POST JSON. Nunca lanza: los fallos de red se reducen a `network`. */
async function post(url: string, body: unknown, signal?: AbortSignal): Promise<ApiReply> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: typeof code === "string" ? code : "upstream", json };
  } catch {
    return { ok: false, code: signal?.aborted ? "aborted" : "network" };
  }
}

const field =
  "min-h-11 w-full rounded-bc border border-bc-border bg-bc-bg-base px-3 text-base text-bc-text-primary " +
  "transition-[border-color,box-shadow] duration-200 ease-bc focus-visible:border-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent";

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-bc bg-bc-accent px-6 text-sm text-bc-surface " +
  "transition-[background-color,transform,opacity] duration-200 ease-bc hover-fine:bg-bc-accent-hover motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-bc border border-bc-accent px-5 text-sm text-bc-accent " +
  "transition-[color,background-color,transform] duration-200 ease-bc hover-fine:bg-bc-accent hover-fine:text-bc-surface motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

export interface ImportDialogProduct {
  id: string;
  title: string;
  image: string | null;
  sku: string | null;
}

/**
 * Modal de importación. El cliente solo MUESTRA: el desglose y el veredicto de la
 * guarda de margen vienen del servidor (preview), y el servidor vuelve a
 * aplicarlos al guardar (por debajo del mínimo exige confirmación explícita).
 * `<dialog>` nativo: foco atrapado, Esc, `inert` del fondo.
 */
export function ImportDialog({ product, onClose }: { product: ImportDialogProduct; onClose: () => void }) {
  const t = useTranslations("admin.import.dialog");
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const priceErrId = useId();

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "fatal" | "saved">("loading");
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [priceText, setPriceText] = useState("");
  const [check, setCheck] = useState<MarginCheckDTO | null>(null);
  const [checking, setChecking] = useState(false);
  const [category, setCategory] = useState<StoreCategory | "">("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultDTO | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  // 1) Datos del producto + PVP inicial.
  useEffect(() => {
    const ctrl = new AbortController();
    setPhase("loading");
    setError(null);
    (async () => {
      const r = await post(PREVIEW_URL, { supplierProductId: product.id }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!r.ok) {
        setError(r.code ?? "upstream");
        setPhase("fatal");
        return;
      }
      const data = r.json as ImportPreviewDTO;
      setPreview(data);
      setCheck(data.check);
      setPriceText(data.suggestedPrice !== null ? formatPriceInput(data.suggestedPrice) : "");
      setPhase("ready");
    })();
    return () => ctrl.abort();
  }, [product.id, attempt]);

  // 2) Recalcular la guarda (en el servidor) al cambiar el PVP, con debounce.
  const parsed = parsePriceInput(priceText);
  useEffect(() => {
    if (phase !== "ready") return;
    if (parsed === null) {
      setChecking(false);
      return;
    }
    if (check && check.price === parsed) {
      setChecking(false);
      return;
    }
    const id = ++reqRef.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      const r = await post(PREVIEW_URL, { supplierProductId: product.id, priceRetail: parsed });
      if (id !== reqRef.current) return; // llegó tarde: hay una petición más nueva
      setChecking(false);
      if (r.ok) {
        setCheck((r.json as ImportPreviewDTO).check);
        setError(null);
      } else {
        setError(r.code ?? "upstream");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `check` se omite a propósito: solo reaccionamos al precio escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, phase, product.id]);

  const fresh = check !== null && parsed !== null && check.price === parsed && !checking;
  const alreadyImported = preview?.alreadyImported ?? null;
  const needsConfirm = fresh && check.belowMin;
  const canSave =
    phase === "ready" && !saving && fresh && !alreadyImported && (!needsConfirm || confirm);

  async function onSave() {
    if (!canSave || parsed === null) return;
    setSaving(true);
    setError(null);
    const r = await post(SAVE_URL, {
      supplierProductId: product.id,
      priceRetail: parsed,
      category: category === "" ? null : category,
      confirmBelowMargin: confirm,
    });
    setSaving(false);
    if (r.ok) {
      setResult(r.json as ImportResultDTO);
      setPhase("saved");
      return;
    }
    const maybeCheck = (r.json as { check?: MarginCheckDTO } | null)?.check;
    if (maybeCheck) setCheck(maybeCheck);
    setError(r.code ?? "upstream");
  }

  function onBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) e.currentTarget.close();
  }

  const errorText = (code: string) => t(`errors.${code === "network" || code in IMPORT_ERROR_STATUS ? code : "upstream"}`);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={onBackdrop}
      data-import-dialog
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-bc border border-bc-border bg-bc-surface p-0 text-bc-text-primary shadow-premium backdrop:bg-bc-bg-base/70 backdrop:backdrop-blur-sm motion-safe:animate-page-in"
    >
      <div className="flex flex-col gap-5 p-5 md:p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-2xl text-bc-text-primary">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("close")}
            className="-mr-2 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-bc text-bc-text-secondary transition-[color,background-color] duration-200 ease-bc hover-fine:bg-bc-primary/10 hover-fine:text-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex items-center gap-3">
          <div className="w-16 shrink-0">
            <ProductThumb src={product.image} alt="" fallbackLabel="" />
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 font-sans text-sm font-medium leading-snug text-bc-text-primary">{product.title}</p>
            {product.sku && <p className="mt-0.5 truncate text-xs text-bc-text-secondary">{t("reference", { sku: product.sku })}</p>}
          </div>
        </div>

        {phase === "loading" && (
          <p role="status" className="py-6 text-sm text-bc-text-secondary">
            {t("loading")}
          </p>
        )}

        {phase === "fatal" && (
          <div role="alert" data-error-code={error ?? undefined} className="flex flex-col items-start gap-3 rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-bg-base p-4">
            <p className="text-sm text-bc-text-primary">{errorText(error ?? "upstream")}</p>
            {RETRYABLE.has(error ?? "upstream") ? (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={secondaryButton}>
                {t("retry")}
              </button>
            ) : (
              <button type="button" onClick={() => ref.current?.close()} className={secondaryButton}>
                {t("close")}
              </button>
            )}
          </div>
        )}

        {phase === "saved" && result && (
          <div role="status" data-import-result className="flex flex-col gap-3 rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-bg-base p-4">
            <p className="text-base font-medium text-bc-text-primary">
              {result.simulated
                ? t("result.simulated")
                : result.created
                  ? t("result.created")
                  : t("result.existing", { status: t(`result.status.${result.status}`) })}
            </p>
            {result.created && <p className="text-sm text-bc-text-secondary">{t("result.createdBody")}</p>}
            {result.forced && <p className="text-sm text-bc-text-secondary">{t("result.forced")}</p>}
            <div>
              <button type="button" onClick={() => ref.current?.close()} className={secondaryButton}>
                {t("close")}
              </button>
            </div>
          </div>
        )}

        {phase === "ready" && preview && (
          <>
            {preview.simulated && (
              <p data-simulated-note className="rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-bg-base px-3 py-2 text-sm text-bc-text-secondary">
                {t("simulated")}
              </p>
            )}
            {alreadyImported && (
              <p data-already-imported role="status" className="rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-bg-base px-3 py-2 text-sm text-bc-text-primary">
                {t(`already.${alreadyImported.status}`)}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("supplier.cost")}</dt>
                <dd className="font-medium tabular-nums text-bc-text-primary">{costHeaderText(preview.product)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("supplier.warehouse")}</dt>
                <dd className="text-bc-text-primary">{preview.product.warehouse}</dd>
              </div>
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("supplier.euStock")}</dt>
                <dd className="tabular-nums text-bc-text-primary">{formatInt(preview.product.euStock)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("supplier.variants")}</dt>
                <dd className="tabular-nums text-bc-text-primary">{preview.product.variantCount}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${titleId}-price`} className="mb-1.5 block text-sm text-bc-text-primary">
                  {t("price.label")}
                </label>
                <div className="relative">
                  <input
                    id={`${titleId}-price`}
                    name="priceRetail"
                    inputMode="decimal"
                    autoComplete="off"
                    value={priceText}
                    disabled={Boolean(alreadyImported) || saving}
                    onChange={(e) => {
                      setPriceText(e.target.value);
                      setConfirm(false); // la confirmación es por precio
                    }}
                    aria-invalid={priceText !== "" && parsed === null}
                    aria-describedby={priceText !== "" && parsed === null ? priceErrId : undefined}
                    className={`${field} pr-9 tabular-nums`}
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-bc-text-secondary">
                    {t("price.unit")}
                  </span>
                </div>
                {priceText !== "" && parsed === null ? (
                  <p id={priceErrId} role="alert" className="mt-1.5 text-xs text-bc-error">
                    {t("price.invalid")}
                  </p>
                ) : (
                  preview.product.suggestedRetail && (
                    <p className="mt-1.5 text-xs text-bc-text-secondary">
                      {t("price.hint", { price: formatMoney(preview.product.suggestedRetail) })}
                    </p>
                  )
                )}
              </div>

              <div>
                <label htmlFor={`${titleId}-cat`} className="mb-1.5 block text-sm text-bc-text-primary">
                  {t("category.label")}
                </label>
                <select
                  id={`${titleId}-cat`}
                  name="category"
                  value={category}
                  disabled={Boolean(alreadyImported) || saving}
                  onChange={(e) => setCategory(isStoreCategory(e.target.value) ? e.target.value : "")}
                  className={field}
                >
                  <option value="">{t("category.none")}</option>
                  {STORE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`category.options.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <section aria-label={t("margin.title")} className="flex flex-col gap-3">
              <h3 className="font-sans text-sm font-medium text-bc-text-primary">{t("margin.title")}</h3>
              {check ? (
                <>
                  <MarginBreakdown check={check} stale={!fresh} costVaries={preview.product.costVaries} />
                  {fresh && !check.belowMin && (
                    <p role="status" data-margin-ok className="text-sm text-bc-text-secondary">
                      {t("margin.ok", { pct: formatPct(check.netMarginPct), min: formatPct(check.minPct) })}
                    </p>
                  )}
                  {fresh && check.belowMin && (
                    <div role="alert" data-margin-below className="flex flex-col gap-3 rounded-bc border border-bc-error border-l-4 p-4">
                      <p className="text-sm font-medium text-bc-error">{t("below.title")}</p>
                      <p className="text-sm text-bc-text-primary">
                        {t("below.body", { pct: formatPct(check.netMarginPct), min: formatPct(check.minPct) })}
                        {check.loss ? ` ${t("below.loss")}` : ""}
                      </p>
                      {check.minPrice !== null ? (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <p className="text-sm tabular-nums text-bc-text-primary">
                            {t("below.minPrice", { min: formatPct(check.minPct), price: formatMoney({ amount: check.minPrice, currency: "EUR" }) })}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setPriceText(formatPriceInput(check.minPrice as number));
                              setConfirm(false);
                            }}
                            disabled={Boolean(alreadyImported) || saving}
                            className={secondaryButton}
                          >
                            {t("below.useMin")}
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-bc-text-primary">{t("below.unreachable")}</p>
                      )}
                      <label className="flex cursor-pointer items-start gap-3 text-sm text-bc-text-primary">
                        <input
                          type="checkbox"
                          name="confirmBelowMargin"
                          checked={confirm}
                          disabled={Boolean(alreadyImported) || saving}
                          onChange={(e) => setConfirm(e.target.checked)}
                          className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 cursor-pointer rounded-bc border-bc-border accent-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
                        />
                        <span>{t("below.confirm")}</span>
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <p role="status" className="text-sm text-bc-text-secondary">
                  {t("margin.calculating")}
                </p>
              )}
              <p className="text-xs text-bc-text-secondary">{t("margin.note")}</p>
            </section>

            {error && error !== "aborted" && (
              <p role="alert" data-error-code={error} className="rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-bg-base px-3 py-2 text-sm text-bc-text-primary">
                {errorText(error)}
              </p>
            )}

            {/* Pie fijo: "Guardar" siempre a mano aunque el desglose obligue a hacer scroll. */}
            <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-3 border-t border-bc-border bg-bc-surface px-5 py-4 md:-mx-6 md:-mb-6 md:px-6">
              <button type="button" onClick={() => ref.current?.close()} className={secondaryButton}>
                {t("cancel")}
              </button>
              <button type="button" onClick={onSave} disabled={!canSave} className={primaryButton}>
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
