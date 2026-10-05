import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

/**
 * Punto único de registro de GSAP. Todo componente de motion importa de aquí,
 * así los plugins están registrados antes de usarse (orden de módulos
 * determinista) y se registran una sola vez.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
}

/** Ease-out exponencial: arranca rápido, asienta suave. Sin bounce. */
export const EASE_OUT = "expo.out";

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
export const MOTION_REDUCED = "(prefers-reduced-motion: reduce)";

export { gsap, ScrollTrigger, SplitText, useGSAP };
