import "server-only";
import { createClient } from "@supabase/supabase-js";

// Utiliza la Service Role Key para bypassear el RLS.
// ESTE ARCHIVO SOLO DEBE USARSE EN EL SERVIDOR (Rutas API, Server Actions)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
