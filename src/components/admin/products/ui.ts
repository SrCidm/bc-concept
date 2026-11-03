/**
 * Vocabulario visual de /admin/productos: el mismo que el modal de importación
 * y los ajustes (campos, botones y avisos), para que el panel se lea como uno.
 * Solo tokens `bc-*`: funciona igual con la paleta clara y con la invertida.
 */

export const field =
  "min-h-11 w-full rounded-bc border border-bc-border bg-bc-bg-base px-3 text-base text-bc-text-primary " +
  "placeholder:text-bc-text-secondary transition-[border-color,box-shadow] duration-200 ease-bc " +
  "focus-visible:border-bc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-bc-error";

export const textarea = `${field} min-h-32 py-2.5 leading-relaxed`;

export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-bc bg-bc-accent px-6 text-sm text-bc-surface " +
  "transition-[background-color,transform,opacity] duration-200 ease-bc hover-fine:bg-bc-accent-hover motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bc-surface";

export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-bc border border-bc-accent px-5 text-sm text-bc-accent " +
  "transition-[color,background-color,transform] duration-200 ease-bc hover-fine:bg-bc-accent hover-fine:text-bc-surface motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bc-surface";

/** Acción destructiva: texto en rojo, sin peso visual hasta el hover. */
export const dangerTextButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-bc px-3 text-sm text-bc-error " +
  "transition-[color,background-color,transform] duration-200 ease-bc hover-fine:bg-bc-error/10 motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-error";

export const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-bc bg-bc-error px-6 text-sm text-bc-surface " +
  "transition-[opacity,transform] duration-200 ease-bc hover-fine:opacity-90 motion-safe:active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-error focus-visible:ring-offset-2 focus-visible:ring-offset-bc-surface";

/** Avisos: borde fino y una marca de 2 px a la izquierda (como en importar y ajustes). */
export const noteInfo = "rounded-bc border border-bc-border border-l-2 border-l-bc-primary bg-bc-bg-base px-4 py-3 text-sm";
export const noteError = "rounded-bc border border-bc-border border-l-2 border-l-bc-error bg-bc-bg-base px-4 py-3 text-sm";
export const noteSuccess = "rounded-bc border border-bc-border border-l-2 border-l-bc-success bg-bc-bg-base px-4 py-3 text-sm";

export const sectionTitle = "font-serif text-xl text-bc-text-primary";
export const label = "mb-1.5 block text-sm text-bc-text-primary";
export const hint = "mt-1.5 text-xs text-bc-text-secondary";
export const fieldError = "mt-1.5 text-xs text-bc-error";
