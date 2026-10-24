import { setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeCategories } from "@/components/home/HomeCategories";
import { HomeStory } from "@/components/home/HomeStory";

/** Home (SSG): hero con dirección de arte, las tres familias y el bloque de marca. */
export default async function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);

  return (
    <>
      <HomeHero />
      <HomeCategories />
      <HomeStory />
    </>
  );
}
