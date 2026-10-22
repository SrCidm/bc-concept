import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { NotFoundView } from "@/components/NotFoundView";

/**
 * 404 del storefront: se pinta dentro de (site)/layout (Header/Footer) y en el
 * idioma de la ruta. Lo disparan `[...rest]` (rutas inexistentes) y cualquier
 * notFound() de las páginas del grupo. Next responde 404 con
 * `<meta name="robots" content="noindex">`. En Next 14 el HTML inicial de un
 * notFound() es un "shell" de error y esta vista la pinta el cliente (con
 * Header/Footer); el estado 404 y el noindex van en la respuesta del servidor.
 */
export default async function SiteNotFound() {
  const t = await getTranslations("notFound");

  return (
    <NotFoundView
      eyebrow={t("eyebrow")}
      title={t("title")}
      body={t("body")}
      actions={
        <>
          <Button href="/" variant="primary">
            {t("home")}
          </Button>
          <Button href="/catalog" variant="outline">
            {t("collection")}
          </Button>
        </>
      }
    />
  );
}
