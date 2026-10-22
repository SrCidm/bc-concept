import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { adminSpanishPath, isAdminPath } from "./lib/adminLocale";
import { legacyRedirectPath } from "./lib/legacyRedirects";

const intlMiddleware = createMiddleware(routing);
// El admin es solo ES: sin detección de idioma (cookie NEXT_LOCALE / Accept-Language),
// para que nunca se redirija a /en/admin (que volvería a /admin: bucle).
const adminIntlMiddleware = createMiddleware({ ...routing, localeDetection: false });

export default function middleware(req: NextRequest) {
  // URLs antiguas de la colección (/catalog, /en/catalog): 308 a la localizada,
  // conservando la query (?q=, filtros).
  const legacy = legacyRedirectPath(req.nextUrl.pathname);
  if (legacy) {
    const url = req.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url, 308);
  }
  // Admin solo en ES: /en/admin/** → /admin/** (antes de cualquier render).
  const spanish = adminSpanishPath(req.nextUrl.pathname);
  if (spanish) {
    const url = req.nextUrl.clone();
    url.pathname = spanish;
    return NextResponse.redirect(url, 307);
  }
  if (isAdminPath(req.nextUrl.pathname)) return adminIntlMiddleware(req);
  return intlMiddleware(req);
}

export const config = {
  // Match all pathnames except:
  //   · /api routes (no i18n needed)
  //   · /_next internals
  //   · /_vercel
  //   · Files with extensions (images, fonts, etc.)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
