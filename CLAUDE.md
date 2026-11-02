# CLAUDE.md — B&C: Concept

Guía persistente para Claude Code. Tienda de **dropshipping de decoración de hogar** (marca curada, Spain-first, estética escandinavo-mediterránea serena). Equipo de 2: Sergio (dev) y Yosra (curaduría/finanzas).

## Estado actual
- **Hito 1 (frontend base) cerrado:** i18n bilingüe, Header/Footer, Hero, componentes base, seguridad de BD v2.
- **Hito 2 cerrado:** catálogo real desde `products_public`, `ProductCard`, buscador tolerante a erratas (`pg_trgm` + `unaccent`), pulido visual y motion del storefront.
- **Trabajando en: Hito 3** — CJ como proveedor principal (adaptador, tipo de cambio, flete real y selector hechos; importación real pendiente de aprobar). Pendiente 3.4b: publicar `draft→active`. Desplegado en Vercel para que Yosra pruebe el panel (ver Despliegue).

## Storefront: rutas y páginas
- **Rutas localizadas** (next-intl `pathnames` en `src/i18n/routing.ts`): clave = carpeta interna, valor = URL por idioma. Colección `/coleccion` · `/en/collection` (carpeta `catalog`), `/sobre-nosotros` · `/en/about`, `/contacto` · `/en/contact`. `Link`/`router` de `@/i18n/navigation` están **tipados** (`AppHref`/`StaticHref`/`RouterHref`): solo claves de `pathnames`; con query, `{ pathname, query }`. Ruta nueva → añadirla a `pathnames`.
- `/catalog`, `/es/catalog`, `/en/catalog` → **308** a la colección localizada conservando la query (`lib/legacyRedirects.ts`, en el middleware). `/admin/**` y `/api/**` fuera de la negociación de idioma (test `localizedRoutes.test.ts` con el middleware real).
- **Sobre nosotros: copy en BORRADOR pendiente de revisión** (Sergio + Yosra), sin años, cifras ni promesas. "Solo piezas enviadas desde almacenes en la UE" es correcto para el catálogo: la importación es fail-closed (solo entra almacén UE explícito); la deuda del filtro UE afecta solo al listado del panel.
- **Contacto:** email desde `CONTACT_EMAIL` (servidor, leída en el build: cambiarla = redesplegar; validada en `lib/contact.ts`). Sin ella la página no muestra ningún email. Plazo: "Solemos responder en 1–2 días laborables". Sin formulario.

- **Colección: `?q=&cat=&page=` combinables** (`lib/catalog/params.ts`, función pura con tests). `cat` validada contra `STORE_CATEGORIES` (lista única en `lib/catalog/categories.ts`; `lib/admin/import.types` la reexporta): desconocida = colección completa. Página inválida = 1. Filtro visible y quitable (`CategoryFilter`: píldoras, la activa con ×; "Todas"), `CatalogPagination` (24 por página, conserva q y cat). **Límite:** con `q`, filtro y paginación trabajan dentro de los 48 mejores resultados de la RPC `search_products_public` (LIMIT 48 en SQL); ampliarlo exige migración.

## Storefront: home
- `(site)/page.tsx` = `HomeHero` + `HomeCategories` + `HomeStory` (`src/components/home/`), Server Components; el único cliente es `HeroMotion` (GSAP: la foto "asienta" 1.06→1 y deriva con el scroll). El texto del hero entra con CSS (`animate-hero-rise`), no con JS, para no retrasar el LCP. Reduced-motion: nada se mueve. `next.config`: imágenes AVIF + WebP.
- Imágenes en `public/images/{home,about}/` (JPG sRGB). **Importación estática** + `fill`/object-cover (o alto automático en `HomeStory`): el código **no depende del tamaño**; sustituir un archivo con el mismo nombre no exige cambios. Hero con dirección de arte: `<picture>` + `getImageProps` (16:9 desde `md`, 4:5 en móvil), `priority` (LCP).
- Categorías enlazan a la colección con `?cat=lighting|textiles|decor` (valores de `STORE_CATEGORIES`).
- `hero-desktop.jpg`: 3344×1888, escalada y normalizada (<1 MB, mozjpeg q88, sRGB sin metadatos).

## Storefront: 404
- `[locale]/(site)/[...rest]` lanza `notFound()` → `(site)/not-found.tsx` (marca, Header/Footer, ES/EN): **404 real + noindex**. En Next 14 el HTML inicial de un `notFound()` es un shell de error y la vista la pinta el cliente. `[locale]/layout` tiene `dynamicParams = false`: un primer segmento que no es locale (p. ej. `/x.txt`, no pasa por el middleware) va al 404 raíz `app/not-found.tsx` (layout raíz de paso), que Next 14 sirve sin CSS (lista legible).

## Área admin (3.2a)
- Route groups: `[locale]/(site)` (Header/Footer/cortina) y `[locale]/(admin)/admin` (sin cromo del storefront; `(panel)` protegido). URLs sin cambios. **Admin solo ES** (middleware redirige `/en/admin/**`).
- **Authz en capas, el layout NO es frontera** (no se re-ejecuta en navegación cliente): cada `page.tsx` de `(panel)` llama a `requireAdminPage()`; `listAdminCatalog()` (`src/lib/admin/catalog.ts`) exige la sesión él mismo (test con adaptador espía); `/api/admin/**` con `requireAdmin` primero. `boundaries.test.ts` lo vigila.
- Mock: `src/lib/suppliers/bigbuy/mock/` (fetch falso con la forma cruda de BigBuy → ejercita el adaptador real). `BIGBUY_MOCK_FAIL=unauthorized|rate_limited|upstream|not_configured` y `BIGBUY_MOCK_LATENCY_MS` para ver estados. Solo lo importa `registry.ts` (test). Activo con `BIGBUY_MOCK=1` en dev y en **Preview de Vercel** (`VERCEL_ENV=preview`); ignorado siempre en `VERCEL_ENV=production` y en `next start` local.
- UI: `src/components/admin/import/*` (presentacional, tipos vía `import type` de `dto.types`); datos en `app/[locale]/(admin)/admin/(panel)/import/ImportResults.tsx`. Estado en la URL (`?supplier=&q=&page=&eu=0&stock=0&curated=0`; `eu`/`stock` solo con BigBuy, `curated` solo con CJ).
- **Modo admin (3.2b):** paleta invertida solo en `/admin` y solo si `isPaletteInvertUser(email)` (`ADMIN_PALETTE_INVERT_EMAILS`, decisión en `(panel)/layout.tsx`); el resto de admins ve la paleta clara, sin cortina. Tokens `bc-*` = variables CSS en `globals.css` (`:root` = tienda, `[data-admin-invert]` = invertida; `html:has(...)` pinta también `<html>`, sin JS). Transición con **View Transitions API** (`AdminModeShell` + `globals.css`): máscara de borde difuminado que barre izq→dcha sobre el contenido real (1,2 s, `cubic-bezier(.65,0,.35,1)`). Primera entrada de la sesión (sin cookie de sesión `bc_admin_curtain`): el servidor pinta claro y el cliente hace la transición a oscuro; con cookie, oscuro directo (F5/navegación interna). "Volver a la tienda": transición inversa y luego `router.push`. Sin soporte de VT o con reduced-motion: cambio instantáneo; el logout borra ambas cookies. Cinta "Sesión admin" en el storefront (`AdminRibbon`, cliente) vía cookie cosmética `bc_admin` (la fija el panel, la borra el logout): el storefront sigue estático.
- **Importación (3.3):** botón "Importar" en cada tarjeta → modal (`ImportDialog`). El servidor calcula y valida TODO: `lib/pricing/{margin,settings,guard}.ts` (guarda de margen; defaults en `settings.ts` + overrides `MARGIN_*`; `marginSettings()` es el único punto a cambiar en 3.4) y `lib/admin/importProduct.ts` (`previewImport`/`importProduct`, auto-guardados). El cliente solo manda id, PVP, categoría (`STORE_CATEGORIES` en `lib/admin/import.types.ts`) y confirmación; coste/almacén/variantes salen del proveedor. Por debajo del mínimo (15 %) exige `confirmBelowMargin` (422 si no). Solo almacén UE explícito (fail-closed); coste siempre en EUR. Escribe `products` + `product_variants` en `draft` con service role; idempotente (`ignoreDuplicates`, no pisa nada). **Simulación sin escribir nada** con `BIGBUY_MOCK` (dev comparte BD con producción) y con CJ salvo `CJ_IMPORT_ENABLED=1`.
- **Ajustes de margen (3.4a):** `/admin/ajustes` → tabla `margin_settings` de **solo inserción** (cada guardado = fila nueva; la vigente es la más reciente; grants SELECT+INSERT solo a service_role + trigger que impide UPDATE/DELETE/TRUNCATE). Precedencia **BD > `MARGIN_*` > defaults**; si la BD falla, entorno/defaults con aviso "degradado". IVA fijo en código (`VAT_PCT = 21`). Estado de la fuente **único por proceso** (`globalThis`, porque Next empaqueta cada ruta por separado): guardar invalida la caché (30 s) que lee el modal. `lib/pricing/{settings,settingsInput,settingsStore}.ts` + `lib/admin/marginSettings.ts` (auto-guardadas). Dev sin tocar la BD: `MARGIN_SETTINGS_MEMORY=1` (ignorado en producción). Los tests nunca leen la BD real (`test/setup.ts` sustituye el almacén).
- **Limitación conocida (solo BigBuy):** la búsqueda por texto filtra los productos de cada página que devuelve BigBuy (el endpoint de búsqueda real no está confirmado); por eso la UI dice "X de N revisados" y ofrece "Siguiente".

## Despliegue (Vercel)
- Proyecto `bc-concept` enlazado al repo. `vercel.json`: Bun (`bun install --frozen-lockfile` / `bun run build`), funciones en **`fra1`** (Supabase B&C está en eu-central-1).
- **Push a `master` = producción.** La rama **`preview`** da el enlace fijo de Yosra (alias de rama); cualquier otra rama = preview efímera.
- Variables: Supabase URL/anon y `ADMIN_*` en Production + Preview; `SUPABASE_SERVICE_ROLE_KEY` = la `sb_secret` **bc-prod** (Sensitive, la gestiona Sergio; nunca la de `.env.local`); `SITE_NOINDEX=1` en ambos hasta el lanzamiento; `BIGBUY_MOCK=1` **solo en Preview**; `CJ_API_KEY` en Production + Preview (Sensitive, la gestiona Sergio); `CJ_IMPORT_ENABLED` **sin cargar**. Stripe no hace falta para el build (el webhook responde 503 sin claves).
- **Previews y producción comparten la BD de B&C:** importar en preview es simulación, pero guardar en `/admin/ajustes` escribe filas reales.
- Supabase Auth → URL Configuration: Site URL = producción; Redirect URLs con producción, alias de `preview` y localhost.

## Comandos
- Runtime: **Bun** (nunca npm/yarn). `bun install`, `bun run dev`, `bun run build`.
- **`bun run build` debe pasar sin errores de TypeScript ni ESLint antes de dar nada por terminado.** Es el criterio de "hecho".

## Stack y convenciones
- Next.js 14 App Router · **TypeScript strict** (sin `any`, sin `@ts-ignore`).
- Server Components por defecto; `"use client"` solo para estado/animación/interacción.
- Estilos: Tailwind con tokens **`bc-*`** (ver `tailwind.config.ts`). Nunca colores hardcodeados ni estilos inline.
- Tipografía: Playfair Display (headings) + Inter (body) vía `next/font`.
- **Mensajes al cliente recortados por zona** (`src/i18n/clientMessages.ts`): el layout de idioma pasa solo `common`, `siteRibbon`, `catalog`; `(admin)/admin/layout.tsx` abre su propio `NextIntlClientProvider` con `admin.*` (nunca en el HTML del storefront). Componente cliente con un namespace nuevo → añadirlo a su lista (lo vigila `clientMessages.test.ts`).
- i18n: **next-intl v4**, `localePrefix: 'as-needed'`. ES por defecto (`/`), EN en `/en`. `<html>`/`<body>` viven en `app/[locale]/layout.tsx` (con `import "../globals.css"`). Sin AR/RTL.
- Estado cliente: **Zustand** (cesta persistente) + Context puntual.
- BD: **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`). **No Prisma.**
- Animación: GSAP + `useGSAP` + `gsap.matchMedia()`, con `prefers-reduced-motion` obligatorio.

## Reglas no negociables (seguridad y negocio)
1. **`price_cost` JAMÁS llega al storefront público/anon** (`products_public`, rutas públicas, bundle de cliente). La tabla base está protegida por grants de columna + RLS. Verificar con `SET ROLE anon` ante cualquier cambio de esquema. **Excepción acotada:** una admin autenticada (`requireAdmin`, primera línea de cada handler de `/api/admin/**`, fail-closed) sí ve el coste del proveedor y el margen en el panel. Esos módulos (`lib/suppliers`, `lib/pricing`) no se importan desde el storefront.
2. **Webhooks:** verificación de firma como primera línea (Stripe `STRIPE_WEBHOOK_SECRET`). 200 rápido + trabajo pesado a cola/Edge Function.
3. **Idempotencia doble:** `stripe_session_id` (webhook) + `order_number` (pedido al proveedor).
4. **Reintentos:** máx. 3 (`retry_count`) → `error_supplier`. Snapshot en `order_items` (`supplier_variant_id`, `title_snapshot`, `unit_cost`) para poder recrear el pedido.
5. **Proveedor-agnóstico:** nada de `cj_*` hardcodeado. `supplier` ('bigbuy'|'cj') + `supplier_*_id`, tras `lib/suppliers/<nombre>/`. **CJ-UE principal; BigBuy secundario y aparcado** hasta que las ventas lo justifiquen. Solo almacén UE.
6. **`DeliveryBadge`:** fuera del Hero, sin punto de color; solo en ficha/cesta/checkout/email.
7. **Secretos** (`SUPABASE_SERVICE_ROLE_KEY`, claves Stripe/proveedor) solo en env del servidor; nunca en el bundle ni en logs.
8. El cliente nunca ve errores internos ("tu pedido está siendo procesado").

## Proveedor principal: CJ Dropshipping
- **Adaptador:** `lib/suppliers/cj/`, validado contra la API real (fixtures en `__fixtures__/`, se regeneran con `scripts/cj-discover.ts`; solo lectura, token en memoria).
- **Catálogo:** V1 `/product/list` (obsoleto, aislado en `cj/endpoints.ts` e `index.ts`), porque `listV2` con `countryCode` apenas devuelve nada (ES: 30 frente a 1.952). No da cantidades: el stock real sale de `getInventoryByPid` en el modal. Búsqueda por nombre en inglés.
- **Listado curado (por defecto):** solo las hojas de categoría de `cj/categories.ts` (hogar, decoración, iluminación, textiles; 1.259 de 1.956 productos ES el 2026-11-02). V1 filtra por un solo `categoryId` (con varios separados por coma devuelve 0), así que se recorre el almacén entero (~10 páginas de 200, ~25 s en frío) y se guarda un índice por proceso 6 h; búsqueda y paginación son locales. `?curated=0` quita el filtro (consulta directa a V1). La clasificación de CJ es aproximada: acota, no sustituye la curaduría.
- **Solo almacén ES:** es el único con ruta a España (DE→ES y FR→ES sin rutas; se sigue comprobando: si se abren, se usan). Fail-closed: almacén UE explícito y solo `cjInventory`, nunca `factoryInventory`. CJ solo da textos en inglés: hay que reescribirlos antes de publicar.
- **Sesión:** token de 180 días en `supplier_credentials`; se reutiliza, refresh a menos de 24 h. Rotar o borrar la key borra los tokens. `CJ_API_KEY` en Vercel (Preview y Production, Sensitive).
- **Vercel:** `maxDuration = 60` en la página y las rutas del proveedor (una ficha son 3 llamadas a CJ, ~6-7 s, más reintentos).
- **Límite:** cola de una petición con ~2 s tras cada respuesta (a 1,2 s CJ ya devuelve `1600200`), por proceso. 50.000 puntos/día (listado 50, resto 10). CJ limita a 3 cuentas por IP y en Vercel las IP son compartidas: los logs lo marcan como `[cj] … límite por IP compartida`.
- **Moneda:** `lib/pricing/fx.ts`. Coste EUR = USD × tipo BCE × (1 + colchón). Tipo diario en `fx_rates`; si falla la consulta, último de menos de 7 días con aviso; si no, `fx_unavailable`. Colchón en `/admin/ajustes` (`fx_buffer_pct`, 3 %, 0-10 %). `price_cost` es siempre EUR; el snapshot guarda coste original, moneda, tipo, fecha, colchón, flete, tipo de producto y vendedor.
- **Flete:** `getShippingRoute` (`freightCalculate`), ruta más barata con la variante más pesada, en modal e importación. Sin ruta a España no se importa. La cuadrícula no muestra margen; el envío medio de ajustes es solo de respaldo para proveedores sin flete (BigBuy).
- **Panel:** selector `?supplier=` (CJ por defecto). **Guardar con CJ es simulación** salvo `CJ_IMPORT_ENABLED=1`, que no se carga en ningún entorno hasta aprobar la importación real.

## Bloqueantes (CJ como proveedor principal)
**De lanzamiento (no se abre la tienda sin resolverlos):**
- **IVA y facturas con CJ:** pendiente del gestor. La API no dice si `sellPrice` incluye IVA ni ofrece facturas, y el vendedor del stock ES es una empresa de Hong Kong (¿quién vende y quién factura?).
- **Devoluciones:** la API de CJ no da dirección ni proceso de devolución (solo disputas: reembolso o reenvío), y el pie promete "Devoluciones (14 días)". Hay que definir dirección y proceso.

**Del hito de pedidos:** cifrar los tokens de `supplier_credentials` (Supabase Vault) ANTES de activar `createOrder`.

**De la Fase 3.4b (publicar `draft→active`):** publicar exige "verificado con muestra" (campo en `products`, lo marca un admin). Sin muestra verificada no se publica.

**Riesgo por confirmar:** la documentación de puntos de CJ dice que 30 días seguidos sin transacciones revocan el acceso a la API (`1600014`). Con la tienda sin lanzar podría afectarnos; lo confirma Sergio con el soporte de CJ.

## Deuda anotada (Hito 3)
- **Filtro UE fail-closed** (crítico): hoy `isEuWarehouse(null)` asume UE. Al validar contra el sandbox de BigBuy (cuando llegue `BIGBUY_API_KEY`) debe pasar a "almacén desconocido = NO elegible UE" (excluir o marcar). Ver TODO en `src/lib/suppliers/bigbuy/warehouses.ts`.
- **Categoría y publicación (Fase 3.4):** la categoría es OBLIGATORIA para publicar (`draft→active`); en `draft` puede quedar sin categoría (el modal de importación la deja opcional). La acción de publicar debe rechazar `category` nulo.
- Valorar cifrar también `api_key` (Supabase Vault) junto con los tokens.
- **Índice curado de CJ en BD (mejora pendiente):** hoy cada instancia de Vercel lo reconstruye en memoria (~24 s en frío y, con varias instancias a la vez, riesgo de `1600200`/429). Persistirlo en una tabla solo para service_role (sin grants a anon/authenticated) y refrescarlo con un cron diario de Vercel; el listado lee de la tabla.
- **La cuadrícula calcula un margen que no muestra:** `toAdminPageDTO` (`lib/suppliers/dto.ts`) deriva margen con el envío medio para cada tarjeta y `ImportCard` no lo pinta. Quitar ese cálculo (y su campo del DTO) o mostrarlo; el margen válido es el del modal.

## Economía unitaria
Antes de catalogar: `precio_venta − IVA(21%) − coste − envío − comisión Stripe − colchón devoluciones = margen neto`. Objetivo neto 15-35%. Si no deja margen, no entra.

## Contexto ampliado (leer bajo demanda, no cargar entero)
- Instrucciones completas y decisiones: `docs/` (PRD, TRD, UI/UX, AppFlow, Backend-Schema, Implementation-Plan, Investigacion-Mercado-Competencia).
- Proveedores: `src/lib/suppliers/<nombre>/` con la interfaz común (`auth`, `listProducts`, `getProduct`). BigBuy ✓ (aparcado); CJ ✓ en `lib/suppliers/cj/` (respuestas reales en `__fixtures__/`, se regeneran con `scripts/cj-discover.ts`). Las respuestas de BigBuy están **sin validar en vivo** hasta tener `BIGBUY_API_KEY` (ver `src/lib/suppliers/bigbuy/endpoints.ts`).
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
