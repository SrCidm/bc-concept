import { notFound } from "next/navigation";

/**
 * Cualquier ruta del storefront que no exista cae aquí y lanza notFound(): así
 * se pinta `(site)/not-found.tsx` (con Header/Footer e idioma) y la respuesta
 * es un 404 real. Sin esta ruta, Next serviría su 404 genérico sin marca.
 */
// El layout de idioma fija dynamicParams=false; aquí cualquier ruta debe encajar.
export const dynamicParams = true;

export default function CatchAllNotFound() {
  notFound();
}
