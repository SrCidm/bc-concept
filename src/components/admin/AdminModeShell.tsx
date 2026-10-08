"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { EASE_OUT, MOTION_OK, gsap } from "@/lib/motion/gsap";

/**
 * "Modo admin" (3.2b): paleta invertida + cortina GSAP izquierda→derecha.
 * Solo se monta para las cuentas de ADMIN_PALETTE_INVERT_EMAILS (la decisión
 * se toma en servidor, en (panel)/layout.tsx); para el resto este componente
 * no existe y el panel se ve en paleta clara, sin cortina.
 *
 * · La paleta la aplica el atributo `data-admin-invert` (ver globals.css), ya
 *   renderizado en servidor: sin parpadeo al recargar.
 * · Entrada: el contenido arranca recortado (`.admin-curtain-init`) y barre a
 *   pantalla completa. Se omite al recargar la página (sin repetir el efecto
 *   en cada F5). `prefers-reduced-motion: reduce` → sin barrido (CSS + aquí).
 * · Salida a la tienda: un velo con la paleta de la tienda barre de izquierda a
 *   derecha y entonces se navega. "Cerrar sesión" (POST + recarga) no pasa por aquí.
 */

interface AdminModeContextValue {
  /** Ejecuta el barrido de salida y llama a `go` al terminar (o ya, sin movimiento). */
  leave: (go: () => void) => void;
}

const AdminModeContext = createContext<AdminModeContextValue | null>(null);

/** `null` fuera del modo admin: quien lo usa debe navegar normalmente. */
export function useAdminMode() {
  return useContext(AdminModeContext);
}

const ENTER_S = 0.85;
const LEAVE_S = 0.7;

/** ¿Esta carga de documento fue un F5? (y es reciente: no confundir con una entrada SPA posterior). */
function isRecentReload(): boolean {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload" && performance.now() < 5000;
}

export function AdminModeShell({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const mm = gsap.matchMedia();

    mm.add(MOTION_OK, () => {
      if (isRecentReload()) {
        gsap.set(el, { clipPath: "none" });
        return;
      }
      const tween = gsap.to(el, {
        clipPath: "inset(0 0% 0 0)",
        duration: ENTER_S,
        ease: EASE_OUT,
        // Al terminar, `none` INLINE (no clearProps: la clase .admin-curtain-init volvería a recortar).
        onComplete: () => gsap.set(el, { clipPath: "none" }),
      });
      return () => {
        tween.kill();
      };
    });

    // Con reduced-motion el CSS ya anula el recorte; esto cubre el resto de casos sin barrido.
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(el, { clipPath: "none" });
    });

    return () => mm.revert();
  }, []);

  const leave = useCallback((go: () => void) => {
    const veil = veilRef.current;
    if (leavingRef.current) return;
    if (!veil || !window.matchMedia(MOTION_OK).matches) {
      go();
      return;
    }
    leavingRef.current = true;
    gsap.to(veil, {
      clipPath: "inset(0 0% 0 0)",
      duration: LEAVE_S,
      ease: EASE_OUT,
      onComplete: go,
    });
  }, []);

  const value = useMemo(() => ({ leave }), [leave]);

  return (
    <AdminModeContext.Provider value={value}>
      {/* Sin JS no hay GSAP que quite el recorte: se anula aquí (igual que .gsap-init). */}
      <noscript>
        <style>{".admin-curtain-init{clip-path:none!important}"}</style>
      </noscript>
      <div ref={contentRef} data-admin-invert className="admin-curtain-init">
        {children}
      </div>
      <div
        ref={veilRef}
        aria-hidden="true"
        className="admin-veil bc-theme-light pointer-events-none fixed inset-0 z-[100] bg-bc-bg-base"
      />
    </AdminModeContext.Provider>
  );
}
