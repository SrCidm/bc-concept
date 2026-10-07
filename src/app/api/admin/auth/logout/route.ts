import { NextResponse } from "next/server";
import { assertSameOrigin, adminErrorResponse } from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await createClient().auth.signOut();
    return NextResponse.redirect(new URL("/admin/login", req.url), 303);
  } catch (e) {
    return adminErrorResponse(e);
  }
}
