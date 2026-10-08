"use client";

import { useEffect } from "react";

/** Nombre de la cookie marcadora que lee la cinta del storefront. */
export const ADMIN_MARKER_COOKIE = "bc_admin";
const MAX_AGE_S = 60 * 60 * 24 * 7;

/**
 * Deja una cookie marcadora mientras el panel está abierto (solo se monta con
 * una admin verificada). Es COSMÉTICA: no concede nada ni se comprueba en
 * ningún servidor; solo permite a la cinta "Sesión admin" del storefront (que
 * es estático y no puede leer la sesión) saber que aquí hubo un login de admin.
 * Se borra en el logout (api/admin/auth/logout).
 */
export function AdminSessionMarker() {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ADMIN_MARKER_COOKIE}=1; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`;
  }, []);
  return null;
}
