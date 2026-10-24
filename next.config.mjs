import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Fuera de buscadores mientras no se lance: con SITE_NOINDEX=1 (Production y
   * Preview en Vercel) todas las respuestas llevan X-Robots-Tag. El metadata del
   * layout raíz añade además <meta name="robots">. Se lee al construir.
   */
  async headers() {
    if (process.env.SITE_NOINDEX !== "1") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  images: {
    // AVIF primero (más ligero), WebP de respaldo.
    formats: ["image/avif", "image/webp"],
    // Hosts de imagen de proveedores (BigBuy principal, CJ secundario).
    // Sin comodines: añadir aquí cualquier host nuevo tras revisar los datos reales.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.bigbuy.eu" },
      { protocol: "https", hostname: "cf.cjdropshipping.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
