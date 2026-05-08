-- B&C Concept - Schema SQL

-- 1. Tablas

-- Productos (sincronizados desde CJ)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cj_product_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_cost NUMERIC NOT NULL,     -- Costo base de CJ
  price_retail NUMERIC NOT NULL,   -- Nuestro precio de venta (costo * markup)
  currency TEXT DEFAULT 'USD',
  images JSONB DEFAULT '[]',       -- Array de URLs
  inventory INT DEFAULT 0,
  category TEXT,
  weight NUMERIC,
  status TEXT DEFAULT 'active',    -- 'active', 'draft', 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Variantes de Productos
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  cj_variant_id TEXT UNIQUE NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cost NUMERIC NOT NULL,
  price_retail NUMERIC NOT NULL,
  inventory INT DEFAULT 0,
  attributes JSONB DEFAULT '{}',   -- e.g., {"color": "white", "size": "M"}
  image TEXT
);

-- Órdenes
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id TEXT UNIQUE,
  cj_order_id TEXT UNIQUE,         -- ID de la orden generada en CJ
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  shipping_address JSONB NOT NULL,
  total_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',   -- 'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
  tracking_number TEXT,
  tracking_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ítems de la Orden
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL,
  unit_price NUMERIC NOT NULL      -- Precio al que se vendió
);

-- Configuración de CJ Tokens
CREATE TABLE cj_tokens (
  id INT PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expiry TIMESTAMPTZ NOT NULL,
  refresh_token_expiry TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Asegurar que solo haya una fila de configuración
ALTER TABLE cj_tokens ADD CONSTRAINT single_row CHECK (id = 1);

-- 2. Seguridad: Vista Pública de Productos
-- Esta vista OMITIRÁ price_cost para que nunca llegue al cliente
CREATE VIEW products_public AS
SELECT 
  id, cj_product_id, title, description, price_retail, currency, images, inventory, category, status, created_at
FROM products
WHERE status = 'active';

-- 3. Row Level Security (RLS)

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cj_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas
-- Products y Variants: Públicamente legibles
CREATE POLICY "Products are viewable by everyone." ON products FOR SELECT USING (true);
CREATE POLICY "Variants are viewable by everyone." ON product_variants FOR SELECT USING (true);

-- Todo lo demás: Solo accesible vía Service Role (Backend)
-- No creamos políticas públicas para INSERT/UPDATE/DELETE.
-- El backend usará el SERVICE_ROLE_KEY que bypassea el RLS.
