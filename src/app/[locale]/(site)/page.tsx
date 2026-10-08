import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/Hero";

export default async function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (process.env.STRIPE_WEBHOOK_SECRET) {
    console.log("✅ Stripe Webhook Secret detectado correctamente en el servidor.");
  } else {
    console.warn("⚠️ Advertencia: STRIPE_WEBHOOK_SECRET no está definido.");
  }

  return <Hero />;
}
