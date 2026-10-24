import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ADMIN_CLIENT_NAMESPACES, pickMessages } from "@/i18n/clientMessages";

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
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (params.locale !== "es") redirect("/admin");
  setRequestLocale("es");

  // Mensajes del panel para sus componentes cliente: solo aquí, nunca en el
  // HTML del storefront (el layout de idioma solo pasa los del storefront).
  const messages = pickMessages(await getMessages(), ADMIN_CLIENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="min-h-dvh bg-bc-bg-base text-bc-text-primary">{children}</div>
    </NextIntlClientProvider>
  );
}
