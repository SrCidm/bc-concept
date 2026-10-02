import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate locale — fall back to default if unknown
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  // Explicit branching keeps the bundler happy (no dynamic string interpolation)
  const messages =
    locale === "en"
      ? (await import("../../messages/en.json")).default
      : (await import("../../messages/es.json")).default;

  return { locale, messages };
});
