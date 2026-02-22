import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@saasfly/ui/button";

import { FeaturesCard } from "~/components/features-card";
import { FeaturesGrid } from "~/components/features-grid";
import { InfiniteMovingCardss } from "~/components/infiniteMovingCards";
import { Questions } from "~/components/questions";
import { RightsideMarketing } from "~/components/rightside-marketing";
import { VideoScroll } from "~/components/video-scroll";
import type { Locale } from "~/config/i18n-config";
import { siteConfig } from "~/config/site";
import { getDictionary } from "~/lib/get-dictionary";

export async function generateMetadata({
  params: { lang },
}: {
  params: {
    lang: Locale;
  };
}): Promise<Metadata> {
  const dict = await getDictionary(lang);
  const keywords = String(dict.marketing.seo_keywords)
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return {
    title: `${siteConfig.name} - ${dict.marketing.seo_title}`,
    description: dict.marketing.seo_description,
    keywords,
    openGraph: {
      title: `${siteConfig.name} - ${dict.marketing.seo_title}`,
      description: dict.marketing.seo_description,
      url: siteConfig.url,
      siteName: siteConfig.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${siteConfig.name} - ${dict.marketing.seo_title}`,
      description: dict.marketing.seo_description,
    },
  };
}

export default async function IndexPage({
  params: { lang },
}: {
  params: {
    lang: Locale;
  };
}) {
  const dict = await getDictionary(lang);
  const buttonVariantsTyped = buttonVariants as unknown as (props?: {
    variant?: string;
    size?: string;
  }) => string;
  return (
    <div className="flex flex-col gap-24">
      <section className="container flex flex-col items-center gap-8 pb-4 pt-10 md:pt-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="rounded-full border border-border bg-muted px-4 py-1 text-sm text-muted-foreground">
            {dict.marketing.introducing}
          </span>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            {dict.marketing.title}
            <span className="text-foreground">ImagePrompt</span>
          </h1>
          <p className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
            {dict.marketing.sub_title}
          </p>
          <p className="max-w-2xl text-balance text-sm text-muted-foreground md:text-base">
            {dict.marketing.seo_blurb}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/${lang}/image-to-prompt`}
            className={buttonVariantsTyped({ size: "lg" })}
          >
            {dict.marketing.get_started}
          </Link>
          <Link
            href={`/${lang}/login`}
            className={buttonVariantsTyped({ size: "lg", variant: "outline" })}
          >
            {dict.marketing.explore_product}
          </Link>
        </div>
      </section>

      <section className="container flex flex-col gap-8" id="features">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-semibold md:text-4xl">
            {dict.marketing.features}
          </h2>
          <p className="text-muted-foreground">{dict.marketing.sub_features}</p>
        </div>
        <FeaturesGrid dict={dict.marketing.features_grid} />
      </section>

      <section className="container flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-semibold md:text-4xl">
            {dict.marketing.main_nav_products}
          </h2>
          <p className="text-muted-foreground">{dict.marketing.k8s_features}</p>
        </div>
        <RightsideMarketing dict={dict.marketing.right_side} lang={lang} />
      </section>

      <section className="container grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold md:text-4xl">
            {dict.marketing.devops_features}
          </h2>
          <p className="text-muted-foreground">{dict.marketing.price_features}</p>
          <VideoScroll dict={dict.marketing.video} />
        </div>
        <FeaturesCard />
      </section>

      <section className="container flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-semibold md:text-4xl">
            {dict.marketing.people_comment.title}
          </h2>
          <p className="text-muted-foreground">
            {dict.marketing.people_comment.desc}
          </p>
        </div>
        <InfiniteMovingCardss />
      </section>

      <section className="container flex flex-col gap-6 pb-16">
        <h2 className="text-3xl font-semibold md:text-4xl">FAQ</h2>
        <Questions />
      </section>
    </div>
  );
}
