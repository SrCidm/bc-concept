/**
 * Llamadas del panel a /api/admin/products/[id]/**. Nunca lanzan: un fallo de
 * red se reduce a `network`. Solo se leen códigos y datos de admin; el servidor
 * nunca manda texto del proveedor ni de la BD.
 */
export interface ApiReply {
  ok: boolean;
  status: number;
  /** Código de error (solo si !ok). */
  code: string;
  body: unknown;
}

export async function send(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown, signal?: AbortSignal): Promise<ApiReply> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, code: "", body: json };
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, status: res.status, code: typeof code === "string" ? code : "generic", body: json };
  } catch {
    return { ok: false, status: 0, code: signal?.aborted ? "aborted" : "network", body: null };
  }
}

export const productApi = (id: string, action?: "margin" | "sample" | "publish" | "unpublish") =>
  `/api/admin/products/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
