import { Hero } from "@/components/Hero";

export default function Home() {
  // Verificación de variables de entorno (Servidor)
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    console.log("✅ Stripe Webhook Secret detectado correctamente en el servidor.");
  } else {
    console.warn("⚠️ Advertencia: STRIPE_WEBHOOK_SECRET no está definido.");
  }

  return (
    <main className="min-h-screen">
      <Hero />
    </main>
  );
}
