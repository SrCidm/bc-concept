import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Link } from "@/i18n/navigation";
import { resolveAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

const buttonClasses =
  "inline-flex items-center min-h-11 px-6 rounded-bc text-sm " +
  "transition-[background-color,color,transform] duration-200 ease-bc motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2";

/**
 * Login del admin (público; el noindex y el título vienen del layout de admin).
 * Tres estados: sin sesión → formulario; admin → acceso al panel; sesión de una
 * cuenta que NO es admin → aviso (sin revelar la lista de admins).
 */
export default async function AdminLoginPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { error?: string };
}) {
  setRequestLocale(params.locale);
  const t = await getTranslations("admin.login");
  const decision = await resolveAdmin();

  const signOut = (
    <form action="/api/admin/auth/logout" method="post">
      <button
        type="submit"
        className={`${buttonClasses} border border-bc-accent text-bc-accent hover-fine:bg-bc-accent hover-fine:text-bc-surface`}
      >
        {t("signOut")}
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh pt-28 md:pt-36 pb-24 md:pb-32">
      <Container>
        <div className="max-w-md">
          <h1 className="font-serif text-4xl md:text-5xl text-bc-text-primary mb-4">
            {t("title")}
          </h1>

          {decision.ok ? (
            <div role="status">
              <p className="text-bc-text-secondary text-base mb-8">
                {t("signedInAs", { email: decision.email })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/admin/import"
                  className={`${buttonClasses} bg-bc-accent text-bc-surface hover-fine:bg-bc-accent-hover`}
                >
                  {t("goToPanel")}
                </Link>
                {signOut}
              </div>
            </div>
          ) : decision.code === "forbidden" ? (
            <div role="alert">
              <p className="text-bc-text-secondary text-base mb-8">
                {decision.email
                  ? t("notAuthorized", { email: decision.email })
                  : t("notAuthorizedNoEmail")}
              </p>
              {signOut}
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
