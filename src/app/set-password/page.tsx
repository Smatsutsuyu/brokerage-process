import { redirect } from "next/navigation";

import { LandAdvisorsLogo } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set your password — Land Advisors Portal",
};

// Reached when an owner has flagged this user's account for a password
// reset (mustSetPassword = true). Sign-in with the temp password lands
// here via the (app) layout gate; any other authenticated request also
// bounces here until the user picks a new password.
export default async function SetPasswordPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  // Already cleared? Kick them back to the app so this page never sits
  // as a dead-end.
  if (!me.mustSetPassword) redirect("/");

  return (
    <div className="bg-brand-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <LandAdvisorsLogo />
        </div>
        <h1 className="text-center text-xl font-bold text-gray-900">Set your password</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Your account was reset. Choose a new password to continue.
        </p>
        <SetPasswordForm />
      </div>
    </div>
  );
}
