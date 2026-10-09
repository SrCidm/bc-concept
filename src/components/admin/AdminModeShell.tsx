"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ADMIN_CURTAIN_COOKIE } from "@/lib/adminCookies";

/**
 * "Modo admin" (3.2b): paleta invertida que se ve CAMBIAR al pasar el borde.
 * Solo se monta para las cuentas con el guiño (ADMIN_PALETTE_INVERT_EMAILS; la
 * decisión es del servidor, en (panel)/layout.tsx). Para el resto no existe.
 *
 * Transición = View Transitions API: `startViewTransition(() => cambiar la
 * paleta)`. El navegador captura la pantalla ANTES (clara) y DESPUÉS (oscura) y
 * globals.css barre la nueva con una máscara de borde difuminado de izquierda a
 * derecha, con la vieja quieta debajo: se ve el contenido real cambiar de claro
 * a oscuro justo en el borde.
 *
 * · Primera entrada de la sesión (sin cookie `bc_admin_curtain`): el servidor
 *   renderiza CLARO y aquí se hace la transición a oscuro y se fija la cookie.
 * · Con cookie: el servidor ya renderiza oscuro (F5, navegación interna): sin
 *   parpadeo ni transición.
 * · "Volver a la tienda": la misma transición a la inversa (oscuro→claro), se borra
 *   la cookie y luego se navega: cada entrada tienda→panel repite la transición.
 *   F5 y la navegación interna del panel no (la cookie sigue ahí). "Cerrar
 *   sesión" (POST + recarga) no pasa por aquí: lo borra el logout.
 * · Sin soporte de View Transitions o con prefers-reduced-motion: cambio instantáneo.
 *   Sin JS: panel claro, visible y usable.
 */

interface AdminModeContextValue {
  /** Transición de salida (oscuro→claro) y entonces llama a `go`; o ya, sin transición. */
  leave: (go: () => void) => void;
}

const AdminModeContext = createContext<AdminModeContextValue | null>(null);

/** `null` fuera del modo admin: quien lo usa debe navegar normalmente. */
export function useAdminMode() {
  return useContext(AdminModeContext);
}

/** Clase temporal en <html> que activa los estilos ::view-transition de globals.css. */
const VT_CLASS = "admin-vt";

function canTransition(): boolean {
  return "startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setCurtainCookie() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // Sin Max-Age: cookie de sesión del navegador.
  document.cookie = `${ADMIN_CURTAIN_COOKIE}=1; Path=/; SameSite=Lax${secure}`;
}

/** Al salir a la tienda: la próxima entrada tienda→panel vuelve a ver la transición. */
function clearCurtainCookie() {
  document.cookie = `${ADMIN_CURTAIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function AdminModeShell({
  children,
  initiallyDark,
}: {
  children: React.ReactNode;
  initiallyDark: boolean;
}) {
  const [dark, setDark] = useState(initiallyDark);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const pendingRef = useRef<Promise<void> | null>(null);
  const startedRef = useRef(false);
  const leavingRef = useRef(false);

  /** Cambia la paleta con transición si se puede; instantáneo si no. */
  const switchTo = useCallback((next: boolean): Promise<void> => {
    const change = () => flushSync(() => setDark(next));
    if (!canTransition()) {
      change();
      return Promise.resolve();
    }
    const root = document.documentElement;
    root.classList.add(VT_CLASS);
    const transition = document.startViewTransition(change);
    return transition.finished
      .catch(() => undefined)
      .finally(() => root.classList.remove(VT_CLASS));
  }, []);

  useEffect(() => {
    if (initiallyDark || startedRef.current) return;
    startedRef.current = true; // StrictMode (dev) ejecuta el efecto dos veces
    // La cookie va ANTES: un F5 a mitad de transición ya carga oscuro, sin repetirla.
    setCurtainCookie();
    pendingRef.current = switchTo(true);
  }, [initiallyDark, switchTo]);

  const leave = useCallback(
    (go: () => void) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      const finish = () => {
        leavingRef.current = false;
        clearCurtainCookie(); // ya no estamos "dentro": la siguiente entrada repite la transición
        go();
      };
      if (!darkRef.current || !canTransition()) {
        finish();
        return;
      }
      // Si la transición de entrada aún corre, se espera a que acabe.
      (pendingRef.current ?? Promise.resolve()).then(() => switchTo(false)).then(finish);
    },
    [switchTo]
  );

  const value = useMemo(() => ({ leave }), [leave]);

  return (
    <AdminModeContext.Provider value={value}>
      <div data-admin-invert={dark ? "" : undefined}>{children}</div>
    </AdminModeContext.Provider>
  );
}
