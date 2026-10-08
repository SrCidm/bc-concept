"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const COOKIE = "bc_admin"; // la fija el panel (AdminSessionMarker) y la borra el logout
const HIDDEN_KEY = "bc_ribbon_hidden";

/**
 * Cinta fina "Sesión admin" en el storefront. Cliente a propósito: el storefront
 * es estático y no puede leer la sesión en servidor; la cinta mira una cookie
 * marcadora (cosmética, no es autorización) al montarse, así que no aparece en
 * el HTML inicial ni cambia el renderizado estático.
 * "Ver como cliente" la oculta en esta pestaña (sessionStorage) para ver la tienda limpia.
 */
export function AdminRibbon() {
  const t = useTranslations("siteRibbon");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hasMarker = document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
    let hidden = false;
    try {
      hidden = sessionStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      /* almacenamiento bloqueado: se muestra */
    }
    setVisible(hasMarker && !hidden);
  }, []);

  if (!visible) return null;

  function hide() {
    try {
      sessionStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      /* sin almacenamiento: se oculta solo hasta recargar */
    }
    setVisible(false);
  }

  // Zona táctil de 44 px sin engordar la cinta: el ::before amplía el área clicable.
  const action =
    "relative inline-flex h-full items-center px-3 text-xs text-bc-surface underline-offset-4 " +
    "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] " +
    "transition-[background-color] duration-200 ease-bc hover-fine:bg-bc-surface/10 hover-fine:underline " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bc-surface";

  return (
    <aside
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 flex h-9 items-center justify-between gap-2 bg-bc-text-primary pl-[clamp(1rem,4vw,2.5rem)] pr-2 text-bc-surface"
    >
      <p className="truncate text-xs tracking-wide">{t("session")}</p>
      <div className="flex h-full shrink-0 items-center">
        {/* <a> normal: el panel es otra "app" (sin cromo de la tienda); entra con recarga completa. */}
        <a href="/admin/import" className={action}>
          {t("toPanel")}
        </a>
        <button type="button" onClick={hide} className={action}>
          {t("viewAsCustomer")}
        </button>
      </div>
    </aside>
  );
}
