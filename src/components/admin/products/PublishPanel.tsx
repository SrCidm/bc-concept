"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { MarginCheckDTO } from "@/lib/admin/import.types";
import type { AdminProductDetailDTO, PublishReason } from "@/lib/admin/products.types";
import { productApi, send } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { FAILURE_FIELD, failureKey, goToField, REASON_FIELD, REQUIREMENTS } from "./fields";
import { formatDay, pct } from "./format";
import { AlertIcon, CheckIcon, PendingIcon, Spinner } from "./icons";
import { StatusBadge } from "./StatusBadge";
import { dangerTextButton, noteError, noteSuccess, primaryButton, secondaryButton } from "./ui";

type Failure =
  | { kind: "reasons"; reasons: PublishReason[] }
  | { kind: "code"; code: string; check?: MarginCheckDTO };

interface ErrorBody {
  error?: { code?: string; reasons?: PublishReason[] };
  check?: MarginCheckDTO;
  marginDrop?: { fromPct: number; toPct: number };
}

function FieldLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        goToField(id);
      }}
      className="whitespace-nowrap text-sm text-bc-accent underline underline-offset-4 transition-colors duration-150 ease-bc hover-fine:text-bc-accent-hover focus-visible:rounded-bc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
    >
      {label}
    </a>
  );
}

/**
 * Publicación: estado, requisitos con los datos guardados y la acción. El
 * SERVIDOR decide (vuelve a pedir el producto al proveedor, ~6 s): aquí solo se
 * muestra su respuesta, con todos los motivos a la vez y un enlace a cada campo.
 * La bajada de margen y el descarte se confirman en diálogos propios.
 */
export function PublishPanel({ product, dirty, onChanged }: { product: AdminProductDetailDTO; dirty: boolean; onChanged: () => void }) {
  const t = useTranslations("admin.products.edit");
  const router = useRouter();
  const [busy, setBusy] = useState<"publish" | "unpublish" | "discard" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<"published" | "unpublished" | null>(null);
  const [drop, setDrop] = useState<{ fromPct: number; toPct: number } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const draft = product.status === "draft";
  const reasons = new Set(product.reasons);

  async function publish(confirmMarginDrop: boolean) {
    setBusy("publish");
    setFailure(null);
    setNotice(null);
    const r = await send("POST", productApi(product.id, "publish"), { confirmMarginDrop });
    setBusy(null);
    if (r.ok) {
      setDrop(null);
      setNotice("published");
      onChanged();
      return;
    }
    const body = (r.body ?? {}) as ErrorBody;
    if (r.code === "margin_dropped" && body.marginDrop) {
      setDrop(body.marginDrop);
      return;
    }
    setDrop(null);
    if (r.code === "publish_blocked" && body.error?.reasons?.length) setFailure({ kind: "reasons", reasons: body.error.reasons });
    else setFailure({ kind: "code", code: r.code, check: body.check });
  }

  async function unpublish() {
    setBusy("unpublish");
    setFailure(null);
    setNotice(null);
    const r = await send("POST", productApi(product.id, "unpublish"));
    setBusy(null);
    if (r.ok) {
      setNotice("unpublished");
      onChanged();
    } else {
      setFailure({ kind: "code", code: r.code });
    }
  }

  async function discard() {
    setBusy("discard");
    const r = await send("DELETE", productApi(product.id));
    if (r.ok) {
      router.push("/admin/productos");
      router.refresh();
      return;
    }
    setBusy(null);
    setDiscardOpen(false);
    setFailure({ kind: "code", code: r.code });
  }

  return (
    <section aria-labelledby="publish-title" className="flex flex-col gap-5 rounded-bc border border-bc-border bg-bc-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="publish-title" className="font-serif text-xl text-bc-text-primary">
          {t("publish.title")}
        </h2>
        <StatusBadge status={product.status} />
      </div>
      <p className="-mt-2 text-sm text-bc-text-secondary">
        {draft ? t("publish.draft") : t("publish.active", { date: product.publishedAt ? formatDay(product.publishedAt) : "—" })}
      </p>

      {(product.slug || product.slugEn) && (
        <div className="flex flex-col gap-2">
          <dl className="flex flex-col gap-2 text-sm">
            {product.slug && (
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("publish.slug")}</dt>
                <dd className="break-all text-bc-text-primary">/product/{product.slug}</dd>
              </div>
            )}
            {product.slugEn && (
              <div>
                <dt className="text-xs text-bc-text-secondary">{t("publish.slugEn")}</dt>
                <dd className="break-all text-bc-text-primary">/en/product/{product.slugEn}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-bc-text-secondary">{t("publish.slugNote")}</p>
        </div>
      )}

      {draft && (
        <div className="flex flex-col gap-3">
          <h3 className="font-sans text-sm font-medium text-bc-text-primary">{t("publish.checklist")}</h3>
          <ul className="flex flex-col gap-2" data-requirements>
            {REQUIREMENTS.map((req) => {
              const missing = req.reasons.find((r) => reasons.has(r));
              return (
                <li key={req.key} data-met={!missing} className="flex items-start justify-between gap-3 text-sm">
                  <span className={["flex items-start gap-2", missing ? "text-bc-text-primary" : "text-bc-text-secondary"].join(" ")}>
                    {missing ? (
                      <PendingIcon className="mt-0.5 shrink-0 text-bc-text-secondary" />
                    ) : (
                      <CheckIcon className="mt-0.5 shrink-0 text-bc-success" />
                    )}
                    <span>
                      {t(`requirements.${req.key}`)}
                      <span className="sr-only"> · {missing ? t("requirements.missing") : t("requirements.met")}</span>
                    </span>
                  </span>
                  {missing && <FieldLink id={REASON_FIELD[missing]} label={t("publish.goTo")} />}
                </li>
              );
            })}
          </ul>
          <p className="text-xs leading-relaxed text-bc-text-secondary">{t("publish.fresh")}</p>
        </div>
      )}

      {failure && (
        <div role="alert" data-publish-failure className={`${noteError} flex flex-col gap-2 text-bc-text-primary`}>
          <p className="flex items-center gap-2 font-medium text-bc-error">
            <AlertIcon className="shrink-0" />
            {t("publish.blockedTitle")}
          </p>
          {failure.kind === "reasons" ? (
            <ul className="flex flex-col gap-2">
              {failure.reasons.map((r) => (
                <li key={r} data-reason={r} className="flex flex-col items-start gap-0.5">
                  <span>{t(`reasons.${r}`)}</span>
                  <FieldLink id={REASON_FIELD[r]} label={t("publish.goTo")} />
                </li>
              ))}
            </ul>
          ) : (
            <p data-failure={failure.code} className="flex flex-col items-start gap-0.5">
              <span>
                {failure.code === "margin_below_min" && failure.check
                  ? t("failures.margin_below_min", { pct: pct(failure.check.netMarginPct), min: pct(failure.check.minPct) })
                  : t(`failures.${failureKey(failure.code)}`)}
              </span>
              {FAILURE_FIELD[failure.code] && draft && <FieldLink id={FAILURE_FIELD[failure.code] as string} label={t("publish.goTo")} />}
            </p>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className={`${noteSuccess} text-bc-text-primary`}>
          {t(`publish.${notice}`)}
        </p>
      )}

      {draft ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => publish(false)}
            disabled={busy !== null || dirty}
            aria-busy={busy === "publish"}
            aria-describedby={dirty ? "publish-save-first" : undefined}
            className={`${primaryButton} w-full`}
          >
            {busy === "publish" && <Spinner />}
            {busy === "publish" ? t("publish.checking") : t("publish.button")}
          </button>
          {busy === "publish" && (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-bc-border" aria-hidden="true">
                <div className="h-full w-1/3 rounded-full bg-bc-accent motion-safe:animate-[publish-progress_1.4s_cubic-bezier(.65,0,.35,1)_infinite] motion-reduce:w-full motion-reduce:opacity-60" />
              </div>
              <p className="text-xs text-bc-text-secondary">{t("publish.checkingDetail")}</p>
            </div>
          )}
          {dirty && busy === null && (
            <p id="publish-save-first" className="text-xs text-bc-text-secondary">
              {t("publish.saveFirst")}
            </p>
          )}
        </div>
      ) : (
        <button type="button" onClick={unpublish} disabled={busy !== null} aria-busy={busy === "unpublish"} className={`${secondaryButton} w-full`}>
          {busy === "unpublish" && <Spinner />}
          {busy === "unpublish" ? t("publish.unpublishing") : t("publish.unpublish")}
        </button>
      )}

      {draft && (
        <div className="border-t border-bc-border pt-4">
          <button type="button" onClick={() => setDiscardOpen(true)} disabled={busy !== null} className={`${dangerTextButton} -ml-3`}>
            {t("discard.button")}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={drop !== null}
        title={t("drop.title")}
        confirmLabel={t("drop.confirm")}
        cancelLabel={t("drop.cancel")}
        busyLabel={t("drop.working")}
        busy={busy === "publish"}
        onConfirm={() => publish(true)}
        onCancel={() => setDrop(null)}
      >
        {drop && <p>{t("drop.body", { from: pct(drop.fromPct), to: pct(drop.toPct) })}</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={discardOpen}
        title={t("discard.title")}
        confirmLabel={t("discard.confirm")}
        cancelLabel={t("discard.cancel")}
        busyLabel={t("discard.working")}
        busy={busy === "discard"}
        tone="danger"
        onConfirm={discard}
        onCancel={() => setDiscardOpen(false)}
      >
        <p>{t("discard.body")}</p>
      </ConfirmDialog>
    </section>
  );
}
