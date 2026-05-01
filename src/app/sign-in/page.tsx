import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LandAdvisorsLogo } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — Lakebridge Capital",
};

export default async function SignInPage() {
  // Already signed in? Skip the form.
  const me = await getCurrentUser();
  if (me) redirect("/");

  return (
    <div className="bg-brand-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <LandAdvisorsLogo />
        </div>
        <h1 className="text-center text-xl font-bold text-gray-900">Sign in</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Lakebridge Capital deal lifecycle platform
        </p>
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
