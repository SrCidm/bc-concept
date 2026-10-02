import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except:
  //   · /api routes (no i18n needed)
  //   · /_next internals
  //   · /_vercel
  //   · Files with extensions (images, fonts, etc.)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
