import { Suspense } from "react";

import { LandAdvisorsLogo } from "@/components/brand/logo";

import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign in — Lakebridge Capital",
};

export default function SignInPage() {
  return (
    <div className="bg-brand-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <LandAdvisorsLogo />
        </div>
        <h1 className="mb-1 text-center text-xl font-bold text-gray-900">Sign in</h1>
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
