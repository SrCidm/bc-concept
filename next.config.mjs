import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Hosts de imagen de proveedores (BigBuy principal, CJ secundario).
    // Sin comodines: añadir aquí cualquier host nuevo tras revisar los datos reales.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.bigbuy.eu" },
      { protocol: "https", hostname: "cf.cjdropshipping.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
