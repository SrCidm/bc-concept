import { cookies } from "next/headers";
import { ADMIN_CURTAIN_COOKIE, adminModeState } from "@/lib/adminCookies";
import { isPaletteInvertUser } from "@/lib/auth/adminFlags";
import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { AdminModeShell } from "@/components/admin/AdminModeShell";
import { AdminSessionMarker } from "@/components/admin/AdminSessionMarker";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

/**
 * Cromo del panel. Comprueba la sesión (defensa en profundidad y para pintar
 * el email), pero NO es la frontera de seguridad: los layouts de Next no se
 * re-ejecutan en navegación cliente. Cada page.tsx llama a requireAdminPage()
 * por su cuenta y el acceso a datos con coste exige la sesión él mismo.
 *
 * Modo admin (3.2b): solo las cuentas de ADMIN_PALETTE_INVERT_EMAILS (Sergio)
 * ven la paleta invertida y la transición; se decide aquí, en servidor, con el
 * email ya verificado. Primera entrada de la sesión (sin cookie bc_admin_curtain):
 * render claro y el cliente hace la transición a oscuro; con cookie, oscuro directo.
 * Para el resto el panel se renderiza tal cual, sin atributo ni envoltorio.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const invert = isPaletteInvertUser(admin.email);
  // La cookie de sesión solo se mira para quien tiene el guiño (Yosra: nada cambia).
  const mode = adminModeState(invert, invert && cookies().has(ADMIN_CURTAIN_COOKIE));

  const chrome = (
    <>
      <AdminTopBar email={admin.email} />
      <main
        id="admin-main"
        className="max-w-[1320px] mx-auto px-[clamp(1rem,3vw,2rem)] py-8 md:py-10"
      >
        {children}
      </main>
    </>
  );

  return (
    <>
      <AdminSessionMarker />
      {mode.shell ? <AdminModeShell initiallyDark={mode.initiallyDark}>{chrome}</AdminModeShell> : chrome}
    </>
  );
}
