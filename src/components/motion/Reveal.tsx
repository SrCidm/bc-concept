"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import {
  gsap,
  ScrollTrigger,
  SplitText,
  useGSAP,
  EASE_OUT,
  MOTION_OK,
  MOTION_REDUCED,
} from "@/lib/motion/gsap";

type Variant = "rise" | "fade" | "lines";

interface RevealProps {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  /**
   * rise  — sube 28px y aparece (por defecto)
   * fade  — solo opacidad, más lento (bloques grandes)
   * lines — título por líneas con máscara (SplitText)
   */
  variant?: Variant;
  /** Retraso en segundos (solo rise/fade/lines). */
  delay?: number;
  /**
   * Revela los hijos [data-reveal-item] por lotes al entrar en pantalla
   * (cuadrículas). Cada hijo debe llevar `data-reveal-item` y `gsap-init`.
   */
  items?: boolean;
}

/**
 * Reveal — aparición al hacer scroll. Client Component.
 * · Estado inicial oculto vía .gsap-init (sin parpadeo) y visible sin JS (noscript).
 * · Una sola vez (once). Ease-out exponencial, nunca scale(0).
 * · prefers-reduced-motion: contenido visible de inmediato, sin movimiento.
 */
export function Reveal({
  as: Tag = "div",
  className = "",
  children,
  variant = "rise",
  delay = 0,
  items = false,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        // Cuadrícula: lotes que entran en pantalla, escalonados.
        if (items) {
          const targets = Array.from(
            el.querySelectorAll<HTMLElement>("[data-reveal-item]")
          );
          if (targets.length === 0) return;
          gsap.set(targets, { y: 28, opacity: 0 });
          ScrollTrigger.batch(targets, {
            start: "top 92%",
            once: true,
            batchMax: 6,
            interval: 0.08,
            onEnter: (batch) =>
              gsap.to(batch, {
                y: 0,
                opacity: 1,
                duration: 0.9,
                ease: EASE_OUT,
                stagger: 0.07,
                overwrite: true,
                clearProps: "transform",
              }),
          });
          return;
        }

        const trigger = { trigger: el, start: "top 88%", once: true };

        if (variant === "lines") {
          // Máscara por líneas: cada línea sube desde su caja recortada.
          SplitText.create(el, {
            type: "lines",
            mask: "lines",
            autoSplit: true,
            aria: "auto",
            onSplit(self) {
              gsap.set(el, { opacity: 1 });
              return gsap.from(self.lines, {
                yPercent: 110,
                duration: 1.1,
                ease: EASE_OUT,
                stagger: 0.09,
                delay,
                scrollTrigger: trigger,
              });
            },
          });
          return;
        }

        if (variant === "fade") {
          gsap.fromTo(
            el,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 1.2,
              ease: EASE_OUT,
              delay,
              scrollTrigger: trigger,
            }
          );
          return;
        }

        gsap.fromTo(
          el,
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            ease: EASE_OUT,
            delay,
            clearProps: "transform",
            scrollTrigger: trigger,
          }
        );
      });

      mm.add(MOTION_REDUCED, () => {
        gsap.set(items ? el.querySelectorAll("[data-reveal-item]") : el, {
          opacity: 1,
          y: 0,
        });
      });
    },
    { scope: ref, dependencies: [variant, delay, items] }
  );

  return (
    <Tag ref={ref} className={[!items && "gsap-init", className].filter(Boolean).join(" ")}>
      {children}
    </Tag>
  );
}
