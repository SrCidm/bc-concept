/**
 * Locale-aware navigation helpers generated from the routing config.
 * Import Link, useRouter, usePathname from here (not from next/navigation)
 * when you need locale-aware navigation.
 */
import type { ComponentProps } from "react";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

/** Destino válido para `Link`/`router`: una ruta de `routing.pathnames` o `{ pathname, query, params }`. */
export type AppHref = ComponentProps<typeof Link>["href"];

/** Rutas sin parámetros, como texto (menús): `"/catalog"`, `"/contacto"`… */
export type StaticHref = Extract<AppHref, string>;

/** Destino válido para `router.push`/`router.replace`. */
export type RouterHref = Parameters<ReturnType<typeof useRouter>["replace"]>[0];
