import type { ReactNode } from "react";

/**
 * Cuerpo de la página 404 (presentacional, Server Component). Lo comparten el
 * 404 del storefront (`[locale]/(site)/not-found.tsx`, con Header/Footer) y el
 * global (`app/not-found.tsx`, para rutas que no pasan por el middleware).
 * Las acciones llegan como nodos: el primero usa Link con idioma, el global <a>.
 */
export function NotFoundView({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <section
      aria-labelledby="not-found-title"
      className="min-h-[70dvh] flex items-center pt-32 md:pt-40 pb-24 md:pb-32"
    >
      <div className="max-w-[1180px] w-full mx-auto px-[clamp(1.25rem,4vw,2.5rem)]">
        <div className="max-w-xl animate-page-in motion-reduce:animate-none">
          <p className="font-sans text-xs tracking-widest uppercase text-bc-text-secondary mb-6">
            {eyebrow}
          </p>
          <h1
            id="not-found-title"
            className="font-serif text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] tracking-[-0.01em] text-bc-text-primary mb-6"
          >
            {title}
          </h1>
          <p className="text-bc-text-secondary text-lg leading-relaxed max-w-prose mb-10">{body}</p>
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        </div>
      </div>
    </section>
  );
}
