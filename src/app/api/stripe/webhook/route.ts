import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook de Stripe. Stripe y el secreto se leen EN LA PETICIÓN, no al importar
 * el módulo: así `next build` (que importa las rutas) no necesita ninguna clave
 * y un despliegue sin Stripe configurado responde 503 en lugar de romper.
 * Fail-closed: sin clave o sin secreto no se procesa nada. Al cliente nunca le
 * llega el detalle del error (regla #8).
 */
let client: { key: string; stripe: Stripe } | null = null;

function getStripe(key: string): Stripe {
  if (!client || client.key !== key) {
    client = { key, stripe: new Stripe(key, { apiVersion: '2026-04-22.dahlia' }) };
  }
  return client.stripe;
}

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error('[stripe webhook] Stripe no está configurado');
    return NextResponse.json({ error: 'Webhook no disponible' }, { status: 503 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event: Stripe.Event;
    try {
      // Validar la firma criptográfica de Stripe (primera línea de defensa, regla #2).
      if (!signature) throw new Error('missing signature');
      event = getStripe(secretKey).webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      console.error('[stripe webhook] firma no válida');
      return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe webhook] checkout completado: ${session.id}`);
        // TODO: Extraer session.metadata.order_id y conectar con Supabase
        // para marcar la orden como pagada antes de enviarla al proveedor.
        break;
      }
      default:
        console.log(`[stripe webhook] evento no manejado: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    console.error('[stripe webhook] error inesperado');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
