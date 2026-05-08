export interface CJTokenResponse {
  code: number;
  result: boolean;
  message: string;
  data: {
    accessToken: string;
    accessTokenExpiryDate: string; // ISO format
    refreshToken: string;
    refreshTokenExpiryDate: string; // ISO format
  };
}

export interface CJProduct {
  pid: string;
  productName: string;
  productImage: string;
  sellPrice: number; // Nuestro costo base
  productWeight: number;
  categoryId: string;
  categoryName: string;
  status: number; // 1: activo
  variants: CJVariant[];
}

export interface CJVariant {
  vid: string;
  pid: string;
  variantName: string;
  variantImage: string;
  variantSellPrice: number; // Costo base de la variante
  variantWeight: number;
  inventory: number;
  variantKey: string; // e.g., "Color-White,Size-M"
}

// ... more types to be added as needed
