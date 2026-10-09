import { NextResponse } from "next/server";
import { assertSameOrigin, adminErrorResponse } from "@/lib/api/admin";
import { ADMIN_CURTAIN_COOKIE } from "@/lib/adminCookies";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await createClient().auth.signOut();
    const res = NextResponse.redirect(new URL("/admin/login", req.url), 303);
    // Borra la cookie cosmética que usa la cinta "Sesión admin" del storefront.
    res.cookies.set("bc_admin", "", { path: "/", maxAge: 0 });
    // Y la de sesión de la transición: el próximo login vuelve a verla.
    res.cookies.set(ADMIN_CURTAIN_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return adminErrorResponse(e);
  }
}
