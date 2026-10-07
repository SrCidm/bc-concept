# CLAUDE.md — B&C: Concept

Guía persistente para Claude Code. Tienda de **dropshipping de decoración de hogar** (marca curada, Spain-first, estética escandinavo-mediterránea serena). Equipo de 2: Sergio (dev) y Yosra (curaduría/finanzas).

## Estado actual
- **Hito 1 (frontend base) cerrado:** i18n bilingüe, Header/Footer, Hero, componentes base, seguridad de BD v2.
- **Hito 2 cerrado:** catálogo real desde `products_public`, `ProductCard`, buscador tolerante a erratas (`pg_trgm` + `unaccent`), pulido visual y motion del storefront.
- **Trabajando en: Hito 3 · Fase 3.1** — adaptador BigBuy (`src/lib/suppliers/`), Route Handlers admin (`/api/admin/**`) y credencial en `supplier_credentials`. Después: 3.2 UI del panel, 3.3 importación, 3.4 guarda de margen configurable.

## Comandos
- Runtime: **Bun** (nunca npm/yarn). `bun install`, `bun run dev`, `bun run build`.
- **`bun run build` debe pasar sin errores de TypeScript ni ESLint antes de dar nada por terminado.** Es el criterio de "hecho".

## Stack y convenciones
- Next.js 14 App Router · **TypeScript strict** (sin `any`, sin `@ts-ignore`).
- Server Components por defecto; `"use client"` solo para estado/animación/interacción.
- Estilos: Tailwind con tokens **`bc-*`** (ver `tailwind.config.ts`). Nunca colores hardcodeados ni estilos inline.
- Tipografía: Playfair Display (headings) + Inter (body) vía `next/font`.
- i18n: **next-intl v4**, `localePrefix: 'as-needed'`. ES por defecto (`/`), EN en `/en`. `<html>`/`<body>` viven en `app/[locale]/layout.tsx` (con `import "../globals.css"`). Sin AR/RTL.
- Estado cliente: **Zustand** (cesta persistente) + Context puntual.
- BD: **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`). **No Prisma.**
- Animación: GSAP + `useGSAP` + `gsap.matchMedia()`, con `prefers-reduced-motion` obligatorio.

## Reglas no negociables (seguridad y negocio)
1. **`price_cost` JAMÁS llega al storefront público/anon** (`products_public`, rutas públicas, bundle de cliente). La tabla base está protegida por grants de columna + RLS. Verificar con `SET ROLE anon` ante cualquier cambio de esquema. **Excepción acotada:** una admin autenticada (`requireAdmin`, primera línea de cada handler de `/api/admin/**`, fail-closed) sí ve el coste del proveedor y el margen en el panel. Esos módulos (`lib/suppliers`, `lib/pricing`) no se importan desde el storefront.
2. **Webhooks:** verificación de firma como primera línea (Stripe `STRIPE_WEBHOOK_SECRET`). 200 rápido + trabajo pesado a cola/Edge Function.
3. **Idempotencia doble:** `stripe_session_id` (webhook) + `order_number` (pedido al proveedor).
4. **Reintentos:** máx. 3 (`retry_count`) → `error_supplier`. Snapshot en `order_items` (`supplier_variant_id`, `title_snapshot`, `unit_cost`) para poder recrear el pedido.
5. **Proveedor-agnóstico:** nada de `cj_*` hardcodeado. `supplier` ('bigbuy'|'cj') + `supplier_*_id`, tras `lib/suppliers/<nombre>/`. BigBuy principal, CJ-EU secundario; solo almacén UE.
6. **`DeliveryBadge`:** fuera del Hero, sin punto de color; solo en ficha/cesta/checkout/email.
7. **Secretos** (`SUPABASE_SERVICE_ROLE_KEY`, claves Stripe/proveedor) solo en env del servidor; nunca en el bundle ni en logs.
8. El cliente nunca ve errores internos ("tu pedido está siendo procesado").

## Deuda anotada (Hito 3)
- **Filtro UE fail-closed** (crítico): hoy `isEuWarehouse(null)` asume UE. Al validar contra el sandbox de BigBuy (cuando llegue `BIGBUY_API_KEY`) debe pasar a "almacén desconocido = NO elegible UE" (excluir o marcar). Ver TODO en `src/lib/suppliers/bigbuy/warehouses.ts`.
- **Guarda de margen (Fase 3.4):** editable por Yosra desde una tabla de ajustes de admin, no `MARGIN_*` en env; y el coste de envío vendrá **por producto** de BigBuy, no fijo. Ver TODO en `src/lib/pricing/margin.ts`.
- Migrar CJ (`src/lib/cj/`) a `lib/suppliers/cj/` con la interfaz común; valorar cifrado de `api_key` (Supabase Vault) antes de producción.

## Economía unitaria
Antes de catalogar: `precio_venta − IVA(21%) − coste − envío − comisión Stripe − colchón devoluciones = margen neto`. Objetivo neto 15-35%. Si no deja margen, no entra.

## Contexto ampliado (leer bajo demanda, no cargar entero)
- Instrucciones completas y decisiones: `docs/` (PRD, TRD, UI/UX, AppFlow, Backend-Schema, Implementation-Plan, Investigacion-Mercado-Competencia).
- Proveedores: `src/lib/suppliers/<nombre>/` con la interfaz común (`auth`, `listProducts`, `getProduct`). BigBuy ✓; CJ (`src/lib/cj/`) pendiente de migrar. Las respuestas de BigBuy están **sin validar en vivo** hasta tener `BIGBUY_API_KEY` (ver `src/lib/suppliers/bigbuy/endpoints.ts`).
- Esquema BD canónico: `supabase/schema.sql` · migración: `supabase/migration_v1_to_v2.sql`.

## Skills (se auto-invocan por su descripción)
- **impeccable** / **emil-design-eng** / **frontend-design** → cualquier trabajo de UI de gama (pulido, componentes, motion).
- **Supabase agent skill** → trabajo de BD/migraciones/seguridad (`npx skills add supabase/agent-skills`).
- Para `ProductCard`/catálogo y buscador, apóyate en impeccable + el skill de Supabase.

## Flujo de trabajo
- Para tareas no triviales: **entra en plan mode** (Shift+Tab), explora y propón un plan antes de editar. Confírmalo y luego implementa.
- Cambios pequeños y obvios: directo.
- Siempre cierra con `bun run build` verde y, si procede, un commit descriptivo (commits convencionales: `feat:`, `fix:`, `chore:`).
- Ante errores, itera hasta pasar la verificación; no "des por hecho" sin ejecutar.
