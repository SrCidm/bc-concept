import { requireAdminPage } from "@/lib/auth/requireAdmin";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

/**
 * Cromo del panel. Comprueba la sesión (defensa en profundidad y para pintar
 * el email), pero NO es la frontera de seguridad: los layouts de Next no se
 * re-ejecutan en navegación cliente. Cada page.tsx llama a requireAdminPage()
 * por su cuenta y el acceso a datos con coste exige la sesión él mismo.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return (
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
}
