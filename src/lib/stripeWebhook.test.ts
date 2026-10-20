import { afterEach, describe, expect, test } from "bun:test";

/**
 * El webhook de Stripe no debe necesitar claves para IMPORTARSE (lo hace
 * `next build` al recolectar las rutas): sin configuración responde 503 y con
 * firma inválida 400, siempre sin filtrar el detalle de Stripe.
 */

const saved = { key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };
afterEach(() => {
  if (saved.key === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = saved.key;
  if (saved.secret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = saved.secret;
});

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers, body: '{"id":"evt_x"}' });

describe("webhook de Stripe", () => {
  test("se importa sin claves (el build no las necesita) y responde 503 genérico", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const route = await import("@/app/api/stripe/webhook/route");
    const r = await route.POST(req({ "stripe-signature": "t=1,v1=abc" }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "Webhook no disponible" });
  });

  test("firma inválida o ausente → 400 sin el mensaje de Stripe", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_tests";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy_for_tests";
    const route = await import("@/app/api/stripe/webhook/route");
    const cases: Record<string, string>[] = [{ "stripe-signature": "t=1,v1=abc" }, {}];
    for (const headers of cases) {
      const r = await route.POST(req(headers));
      expect(r.status).toBe(400);
      const text = await r.text();
      expect(JSON.parse(text)).toEqual({ error: "Firma no válida" });
      expect(text).not.toMatch(/No signatures|timestamp|whsec|sk_test/i);
    }
  });
});
