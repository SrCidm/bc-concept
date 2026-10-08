import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

// Zona privada: fuera de buscadores, y con título propio.
export const metadata: Metadata = {
  title: "Admin · B&C",
  robots: { index: false, follow: false },
};

/**
 * Envoltorio del área admin. Sin Header/Footer del storefront (no pertenece al
 * grupo (site)). El admin es solo ES: el middleware ya redirige /en/admin; esto
 * es la red de seguridad si una petición llegara con otro idioma.
 *
 * NOTA de seguridad: este layout NO autentica. La guarda vive en cada page.tsx
 * del panel ((panel)) y en listAdminCatalog; ver lib/auth/requireAdmin.ts.
 */
export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (params.locale !== "es") redirect("/admin");
  setRequestLocale("es");

  return (
    <div className="min-h-dvh bg-bc-bg-base text-bc-text-primary">{children}</div>
  );
}
