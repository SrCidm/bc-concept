import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * B&C: Concept — Design tokens (paleta vigente salvia/oliva).
 * Reemplaza los tokens legacy de SERYOS (#D4A373 oro, #1A1A1A, #4A6B5D).
 * Las fuentes usan las CSS variables de next/font (Playfair Display + Inter).
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bc: {
          "bg-base":       "#F5F5F0", // fondo principal (blanco hueso)
          surface:         "#FFFFFF", // tarjetas / superficies
          "text-primary":  "#161708", // texto principal (negro oliva)
          "text-secondary":"#6B6B6B", // secundario — usar en texto ≥16px / no crítico
          primary:         "#94977F", // verde salvia
          accent:          "#40422D", // oliva oscuro (botones, acentos)
          "accent-hover":  "#33351F", // estado hover del oliva
          border:          "#E5E5E0",
          success:         "#059669",
          error:           "#DC2626",
        },
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans:  ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        brand: "0.06em", // logotipo B&C: Concept
      },
      borderRadius: {
        bc: "2px", // esquinas sobrias, casi rectas
      },
      boxShadow: {
        premium: "0 1px 2px rgba(22,23,8,.04), 0 8px 24px rgba(22,23,8,.06)",
      },
      transitionTimingFunction: {
        // ease-out exponencial (sin bounce)
        bc: "cubic-bezier(.16,1,.3,1)",
      },
      maxWidth: {
        prose: "70ch", // tope de longitud de línea legible
      },
      keyframes: {
        // Solo opacidad/transform. Entrada rápida, salida más rápida aún.
        "page-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "menu-in": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "menu-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(-6px)" },
        },
      },
      animation: {
        "page-in": "page-in 280ms cubic-bezier(.16,1,.3,1) both",
        "menu-in": "menu-in 220ms cubic-bezier(.16,1,.3,1) both",
        "menu-out": "menu-out 140ms cubic-bezier(.16,1,.3,1) both",
      },
    },
  },
  future: {
    // Los estados hover solo aplican en dispositivos con hover real
    // (evita falsos positivos al tocar en móvil).
    hoverOnlyWhenSupported: true,
  },
  plugins: [
    // hover-fine: hover solo con puntero fino y hover real (ratón/trackpad).
    // Evita el hover "pegado" al tocar en móvil/tablet.
    plugin(({ addVariant }) => {
      addVariant(
        "hover-fine",
        "@media (hover: hover) and (pointer: fine) { &:hover }"
      );
      // group-hover-fine: anima partes internas (p. ej. un SVG) cuando el
      // contenedor `.group` recibe hover real.
      addVariant(
        "group-hover-fine",
        "@media (hover: hover) and (pointer: fine) { :merge(.group):hover & }"
      );
    }),
  ],
};

export default config;