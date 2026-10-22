import { inter, playfair } from "@/lib/fonts";
import { NotFoundView } from "@/components/NotFoundView";
import es from "../../messages/es.json";
import "./globals.css";

/**
 * 404 raíz: solo para rutas cuyo primer segmento no es un locale y que no pasan
 * por el middleware (p. ej. con punto, `/x.txt`); el resto usa el 404 de marca de
 * `[locale]/(site)/not-found.tsx`. Responde 404 con noindex, en español.
 * Limitación de Next 14: con un layout raíz que no pinta `<html>`, este 404 se
 * sirve sin la hoja de estilos; por eso las acciones van en una lista, legible
 * también sin CSS.
 */
export default function GlobalNotFound() {
  const t = es.notFound;
  const linkBase =
    "inline-flex items-center justify-center font-sans rounded-bc px-6 py-3 text-sm " +
    "transition-[background-color,color] ease-bc duration-200 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-bc-accent";

  return (
    <html lang="es" className={`${inter.variable} ${playfair.variable}`}>
      <body className="bg-bc-bg-base text-bc-text-primary font-sans antialiased">
        <NotFoundView
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
          actions={
            <ul className="flex flex-wrap items-center gap-3 list-none p-0 m-0">
              <li>
                <a href="/" className={`${linkBase} bg-bc-accent text-bc-surface hover:bg-bc-accent-hover`}>
                  {t.home}
                </a>
              </li>
              <li>
                <a
                  href="/coleccion"
                  className={`${linkBase} border border-bc-accent text-bc-accent hover:bg-bc-accent hover:text-bc-surface`}
                >
                  {t.collection}
                </a>
              </li>
            </ul>
          }
        />
      </body>
    </html>
  );
}
