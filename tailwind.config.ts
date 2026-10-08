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
        // Cada token es una variable CSS (canales RGB) definida en globals.css:
        // `:root` guarda la paleta de la tienda y `[data-admin-invert]` la del
        // modo admin. `<alpha-value>` mantiene vivas las utilidades con opacidad
        // (bg-bc-primary/10, etc.). Los valores viven SOLO en globals.css.
        bc: {
          "bg-base":       "rgb(var(--bc-bg-base) / <alpha-value>)",        // fondo principal (blanco hueso)
          surface:         "rgb(var(--bc-surface) / <alpha-value>)",        // tarjetas / superficies
          "text-primary":  "rgb(var(--bc-text-primary) / <alpha-value>)",   // texto principal (negro oliva)
          "text-secondary":"rgb(var(--bc-text-secondary) / <alpha-value>)", // secundario — usar en texto ≥16px / no crítico
          primary:         "rgb(var(--bc-primary) / <alpha-value>)",        // verde salvia
          accent:          "rgb(var(--bc-accent) / <alpha-value>)",         // oliva oscuro (botones, acentos)
          "accent-hover":  "rgb(var(--bc-accent-hover) / <alpha-value>)",   // estado hover del oliva
          border:          "rgb(var(--bc-border) / <alpha-value>)",
          success:         "rgb(var(--bc-success) / <alpha-value>)",
          error:           "rgb(var(--bc-error) / <alpha-value>)",
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