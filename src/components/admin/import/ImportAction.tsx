"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImportDialog, type ImportDialogProduct } from "./ImportDialog";

/**
 * Botón "Importar" de la tarjeta + su modal. El diálogo solo se monta mientras
 * está abierto (24 tarjetas no cargan 24 modales ni 24 previews).
 */
export function ImportAction({ product }: { product: ImportDialogProduct }) {
  const t = useTranslations("admin.import.dialog");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openAria", { title: product.title })}
        data-import-open
        className="inline-flex min-h-11 w-full items-center justify-center rounded-bc border border-bc-accent px-4 text-sm text-bc-accent transition-[color,background-color,transform] duration-200 ease-bc hover-fine:bg-bc-accent hover-fine:text-bc-surface motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
      >
        {t("open")}
      </button>
      {open && <ImportDialog product={product} onClose={() => setOpen(false)} />}
    </>
  );
}
