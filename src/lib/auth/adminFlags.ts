import "server-only";
import { parseAdminEmails } from "./requireAdmin";

/**
 * Guiños de interfaz por cuenta (no son autorización). El único hoy es la
 * inversión de paleta del panel (Hito 3.2b), reservada a la cuenta de Sergio:
 * Yosra y cualquier otra admin ven el panel en paleta clara.
 *
 * Se decide SOLO en servidor, a partir del email del usuario ya autenticado y de
 * la variable `ADMIN_PALETTE_INVERT_EMAILS` (misma normalización que ADMIN_EMAILS).
 * Nada de correos escritos en el código ni en el cliente. Sin variable → nadie.
 */
export function isPaletteInvertUser(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_PALETTE_INVERT_EMAILS
): boolean {
  const e = email?.trim().toLowerCase();
  if (!e) return false;
  return parseAdminEmails(raw).has(e);
}
