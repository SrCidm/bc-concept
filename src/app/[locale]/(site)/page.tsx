import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/Hero";

export default async function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  return <Hero />;
}
