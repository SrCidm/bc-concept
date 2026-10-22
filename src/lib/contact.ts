/**
 * Email público de contacto desde `CONTACT_EMAIL` (servidor; la página es SSG,
 * así que se lee en el build: cambiarla exige redesplegar). Si falta o no tiene
 * forma de email, devuelve null y la página NO muestra ningún email.
 */
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>".]{2,}$/;

export function contactEmail(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.CONTACT_EMAIL?.trim();
  if (!value || value.length > 254 || !EMAIL.test(value)) return null;
  return value;
}
