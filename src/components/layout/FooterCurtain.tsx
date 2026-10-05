"use client";

import { useEffect, useRef } from "react";

/**
 * Mide el alto del footer y lo publica en --bc-footer-h para la "cortina":
 * el contenido desliza y descubre el footer fijo detrás (ver globals.css).
 * La regla CSS solo se activa en pantallas con altura suficiente y sin
 * reduced-motion; en el resto la variable no tiene efecto.
 */
export function FooterCurtain({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty(
        "--bc-footer-h",
        `${entry.target.getBoundingClientRect().height}px`
      );
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bc-footer-h");
    };
  }, []);

  return (
    <div ref={ref} className="footer-curtain">
      {children}
    </div>
  );
}
