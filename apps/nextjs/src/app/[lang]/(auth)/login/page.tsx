import React from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@saasfly/ui";
import { buttonVariants } from "@saasfly/ui/button";
import * as Icons from "@saasfly/ui/icons";

import { UserClerkAuthForm } from "~/components/user-clerk-auth-form";
import type { Locale } from "~/config/i18n-config";
import { getDictionary } from "~/lib/get-dictionary";

export const metadata: Metadata = {
  title: "Login",
  description: "Login to your account",
};

export default async function LoginPage({
  params: { lang },
}: {
  params: {
    lang: Locale;
  };
}) {
  const dict = await getDictionary(lang);
  const cnTyped = cn as unknown as (...inputs: unknown[]) => string;
  const buttonVariantsTyped = buttonVariants as unknown as (props?: {
    variant?: string;
  }) => string;
  const IconsTyped = Icons as unknown as Record<string, React.ComponentType<{
    className?: string;
  }>>;
  const ChevronLeftIcon = IconsTyped.ChevronLeft;
  return (
    <div className="container flex h-screen w-screen flex-col items-center justify-center">
      <Link
        href={`/${lang}`}
        className={cnTyped(
          buttonVariantsTyped({ variant: "ghost" }),
          "absolute left-4 top-4 md:left-8 md:top-8",
        )}
      >
        <>
          <ChevronLeftIcon className="mr-2 h-4 w-4" />
          {dict.login.back}
        </>
      </Link>
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <div className="text-3xl font-semibold">ImagePrompt</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {dict.login.welcome_back}
          </h1>
          <p className="text-sm text-muted-foreground">
            {dict.login.signin_title}
          </p>
        </div>
        <UserClerkAuthForm lang={lang} dict={dict.login} />
        {/* <p className="px-8 text-center text-sm text-muted-foreground">
          <Link
            href={`/${lang}/register`}
            className="hover:text-brand underline underline-offset-4"
          >
            {dict.login.singup_title}
          </Link>
        </p> */}
      </div>
    </div>
  );
}
