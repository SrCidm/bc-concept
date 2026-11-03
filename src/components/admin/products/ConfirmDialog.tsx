"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { dangerButton, primaryButton, secondaryButton } from "./ui";
import { Spinner } from "./icons";

/**
 * Confirmación con `<dialog>` nativo (foco atrapado, Esc, fondo inerte), nunca
 * `confirm()` del navegador. El foco inicial va a "Cancelar": la opción segura.
 * Mientras `busy`, no se puede cerrar ni repetir la acción.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  busyLabel,
  busy = false,
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busyLabel: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancelRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: lo decide quien abre el diálogo (y no durante la acción)
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-bc border border-bc-border bg-bc-surface p-0 text-bc-text-primary shadow-premium backdrop:bg-bc-bg-base/70 backdrop:backdrop-blur-sm motion-safe:animate-page-in"
    >
      <div className="flex flex-col gap-4 p-5 md:p-6">
        <h2 id={titleId} className="font-serif text-xl text-bc-text-primary">
          {title}
        </h2>
        <div id={bodyId} className="flex flex-col gap-3 text-sm leading-relaxed text-bc-text-primary">
          {children}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={secondaryButton}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} className={tone === "danger" ? dangerButton : primaryButton}>
            {busy && <Spinner />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
