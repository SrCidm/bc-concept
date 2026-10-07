import "server-only";

export type SupplierErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "bad_response"
  | "not_found"
  | "invalid_request"
  | "unsupported";

/** HTTP que devolvemos al admin por cada código (nunca el del proveedor). */
const HTTP_STATUS: Record<SupplierErrorCode, number> = {
  not_configured: 503,
  unauthorized: 502, // el proveedor rechazó NUESTRA credencial: no es un 401 del admin
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  bad_response: 502,
  not_found: 404,
  invalid_request: 400,
  unsupported: 501,
};

/** Mensajes fijos y seguros: sin URL, cabeceras, cuerpos ni credenciales. */
const SAFE_MESSAGE: Record<SupplierErrorCode, string> = {
  not_configured: "El proveedor no tiene credencial configurada.",
  unauthorized: "El proveedor ha rechazado la credencial.",
  rate_limited: "El proveedor limita las peticiones. Inténtalo de nuevo en unos segundos.",
  timeout: "El proveedor no ha respondido a tiempo.",
  upstream: "El proveedor no está disponible ahora mismo.",
  bad_response: "La respuesta del proveedor no tiene el formato esperado.",
  not_found: "No existe en el proveedor.",
  invalid_request: "Petición no válida.",
  unsupported: "Proveedor no soportado todavía.",
};

export class SupplierError extends Error {
  readonly code: SupplierErrorCode;
  readonly status: number;

  constructor(code: SupplierErrorCode, options?: { cause?: unknown }) {
    // El mensaje es SIEMPRE el seguro: aunque alguien haga console.error(err)
    // no puede aparecer la key. La causa original no se serializa.
    super(SAFE_MESSAGE[code]);
    this.name = "SupplierError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    if (options?.cause !== undefined) {
      Object.defineProperty(this, "cause", { value: options.cause, enumerable: false });
    }
  }

  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}

export function isSupplierError(e: unknown): e is SupplierError {
  return e instanceof SupplierError;
}
