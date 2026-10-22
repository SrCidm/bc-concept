import { Inter, Playfair_Display } from "next/font/google";

/** Fuentes de la marca (next/font). Las comparten el layout de idioma y el 404 global. */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const playfair = Playfair_Display({
  subsets: ["latin"],
  // Cursiva real (el tagline del Hero): sin esto el navegador la sintetiza.
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});
