/**
 * Layout raíz de paso: `<html>`/`<body>` viven en `[locale]/layout.tsx`. Existe
 * solo para que `app/not-found.tsx` (rutas fuera de los locales conocidos) tenga
 * un layout por encima, como indica next-intl.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
