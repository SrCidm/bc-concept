"use client";

import { useTranslations } from "next-intl";
import { iconControlClasses } from "@/components/layout/controlStyles";

interface CartButtonProps {
  /**
   * Nº de artículos. Estático (0) hasta el Hito 3: entonces se alimentará del
   * store de Zustand en el punto de uso (<CartButton count={items} />).
   * El número solo se pinta si count > 0.
   */
  count?: number;
  /**
   * icon    — en reposo solo la bolsa (44×44); al hover/foco se despliega la
   *           etiqueta "Cesta" (Header de escritorio). El hueco para la
   *           etiqueta lo reserva el padre (ver HeaderClient).
   * labeled — bolsa + "Cesta" siempre visible (menú móvil)
   */
  variant?: "icon" | "labeled";
  className?: string;
}

function CartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

/**
 * CartButton — bolsa (+ "Cesta") y contador solo si count > 0.
 * El aria-label comunica siempre el estado, se pinte o no el número ni la
 * etiqueta ("Cesta, vacía" / "Cesta, 3 artículos"); empieza por el texto
 * visible (WCAG 2.5.3).
 *
 * Variante icon: la etiqueta se despliega a la izquierda de la bolsa con solo
 * opacity + transform (sin animar el ancho). Aparece con hover real (puntero
 * fino) y con foco de teclado; con prefers-reduced-motion aparece sin
 * movimiento. En táctil no hay hover: la etiqueta no se muestra (el menú
 * móvil usa la variante labeled).
 */
export function CartButton({
  count = 0,
  variant = "labeled",
  className = "",
}: CartButtonProps) {
  const t = useTranslations("common");
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const badgeText = safeCount > 99 ? "99+" : String(safeCount);

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={t("cartAria", { count: safeCount })}
        className={[
          "relative flex size-11 items-center justify-center",
          iconControlClasses,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <CartIcon />
        {/* Etiqueta: fuera del flujo, a la izquierda de la bolsa. Invisible y
            sin captar el puntero hasta que el botón recibe hover/foco. */}
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm",
            "opacity-0",
            // Apertura gradual (450ms, estado hover/foco), cierre más ágil
            // (260ms, estado base): la duración la marca el estado destino.
            "transition-[opacity,transform] duration-[260ms] ease-bc",
            "motion-safe:translate-x-2 motion-reduce:transition-none",
            "group-hover-fine:opacity-100 group-hover-fine:pointer-events-auto",
            "group-hover-fine:duration-[450ms]",
            "motion-safe:group-hover-fine:translate-x-0",
            "group-focus-visible:opacity-100 group-focus-visible:duration-[450ms]",
            "motion-safe:group-focus-visible:translate-x-0",
          ].join(" ")}
        >
          {t("cart")}
        </span>
        {safeCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-0.5 min-w-4 h-4 px-1 rounded-full bg-bc-accent text-bc-surface text-[10px] leading-4 text-center tabular-nums"
          >
            {badgeText}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={t("cartAria", { count: safeCount })}
      className={[
        "flex items-center gap-2 min-h-11 px-3 text-sm",
        iconControlClasses,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <CartIcon />
      <span>{t("cart")}</span>
      {safeCount > 0 && (
        <span
          aria-hidden="true"
          className="min-w-5 h-5 px-1.5 rounded-full bg-bc-accent text-bc-surface text-[11px] leading-5 text-center tabular-nums"
        >
          {badgeText}
        </span>
      )}
    </button>
  );
}
