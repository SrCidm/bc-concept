"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Login por enlace mágico. `shouldCreateUser: false`: solo entran usuarios que
 * ya existen en Supabase Auth (los crea Sergio a mano). El mensaje de éxito es
 * el mismo exista o no el correo, para no revelar qué emails son válidos.
 */
export function AdminLoginForm() {
  const t = useTranslations("admin.login");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setStatus("sending");
    try {
      await createClient().auth.signInWithOtp({
        email: value,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/api/admin/auth/callback?next=/admin/import`,
        },
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm text-bc-text-primary">
        {t("emailLabel")}
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 rounded-bc border border-bc-border bg-bc-surface px-3 text-base text-bc-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex items-center justify-center min-h-11 px-6 rounded-bc bg-bc-accent text-bc-surface text-sm transition-[background-color,transform] duration-200 ease-bc hover:bg-bc-accent-hover motion-safe:active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-accent focus-visible:ring-offset-2"
      >
        {status === "sending" ? t("sending") : t("submit")}
      </button>
      {status === "sent" && (
        <p role="status" className="text-bc-text-secondary text-sm">
          {t("sent")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-bc-error text-sm">
          {t("error")}
        </p>
      )}
    </form>
  );
}
