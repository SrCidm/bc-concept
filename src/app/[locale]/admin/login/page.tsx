import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Zona privada: fuera de buscadores.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLoginPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { error?: string };
}) {
  setRequestLocale(params.locale);
  const t = await getTranslations("admin.login");

  const { data } = await createClient().auth.getUser();
  const email = data.user?.email ?? null;

  return (
    <div className="min-h-dvh pt-28 md:pt-36 pb-24 md:pb-32">
      <Container>
        <div className="max-w-md">
          <h1 className="font-serif text-4xl md:text-5xl text-bc-text-primary mb-4">
            {t("title")}
          </h1>

          {email ? (
            <div role="status">
              <p className="text-bc-text-secondary text-base mb-8">
                {t("signedInAs", { email })}
              </p>
              <form action="/api/admin/auth/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center min-h-11 px-6 rounded-bc border border-bc-accent text-bc-accent text-sm transition-[background-color,color,transform] duration-200 ease-bc hover:bg-bc-accent hover:text-bc-surface motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
                >
                  {t("signOut")}
                </button>
              </form>
            </div>
          ) : (
            <>
              <p className="text-bc-text-secondary text-base mb-8">{t("intro")}</p>
              {searchParams.error && (
                <p role="alert" className="text-bc-error text-sm mb-4">
                  {t("linkInvalid")}
                </p>
              )}
              <AdminLoginForm />
            </>
          )}
        </div>
      </Container>
    </div>
  );
}
