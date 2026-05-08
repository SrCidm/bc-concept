import { supabaseAdmin } from "../supabase/admin";
import { CJTokenResponse } from "@/types/cj.types";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0";

export async function getCJAccessToken(): Promise<string | null> {
  // 1. Intentar obtener el token de Supabase
  const { data: tokenData, error } = await supabaseAdmin
    .from("cj_tokens")
    .select("*")
    .eq("id", 1)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching CJ token from Supabase:", error);
    return null;
  }

  const now = new Date();

  // Si existe y no ha expirado, lo retornamos
  if (tokenData && new Date(tokenData.access_token_expiry) > now) {
    return tokenData.access_token;
  }

  // Si no existe o expiró, intentamos hacer refresh (si el refresh_token es válido)
  // Nota: La API de CJ no especifica un endpoint de "refresh_token" explícito en v2.0
  // en su lugar, piden llamar a /getAccessToken con la apiKey nuevamente cuando expira (cada 15 días).

  return await fetchNewCJToken();
}

async function fetchNewCJToken(): Promise<string | null> {
  const email = process.env.CJ_EMAIL;
  const apiKey = process.env.CJ_API_KEY;

  if (!email || !apiKey) {
    console.error("CJ API credentials are not set in environment variables");
    return null;
  }

  try {
    const response = await fetch(`${CJ_API_BASE}/v1/authentication/getAccessToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, apiKey }),
    });

    const result: CJTokenResponse = await response.json();

    if (!result.result || result.code !== 200) {
      console.error("Failed to authenticate with CJ API:", result.message);
      return null;
    }

    const { accessToken, accessTokenExpiryDate, refreshToken, refreshTokenExpiryDate } = result.data;

    // Actualizar o insertar en Supabase
    const { error } = await supabaseAdmin.from("cj_tokens").upsert({
      id: 1,
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expiry: accessTokenExpiryDate,
      refresh_token_expiry: refreshTokenExpiryDate,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error saving new CJ token to Supabase:", error);
    }

    return accessToken;
  } catch (error) {
    console.error("Error calling CJ Auth API:", error);
    return null;
  }
}
