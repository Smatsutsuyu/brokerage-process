import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth/get-current-user";

import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My profile — Lakebridge Capital",
};

const ROLE_LABEL: Record<"owner" | "broker" | "analyst" | "viewer", string> = {
  owner: "Owner",
  broker: "Broker",
  analyst: "Analyst",
  viewer: "Viewer",
};

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");

  const fullName = me.name || me.email;
  const initials =
    fullName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      <Sidebar />
      <main className="bg-brand-bg flex-1 overflow-y-auto px-10 py-8">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold text-gray-900">My profile</h1>
          <p className="text-[13px] text-gray-400">
            Account details and password. To change your role or disable an account, an owner uses
            the Members page.
          </p>
        </header>

        <div className="grid max-w-2xl gap-4">
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-4">
              <div className="bg-brand-ink flex h-14 w-14 items-center justify-center rounded-full text-base font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-gray-900">{fullName}</div>
                <div className="text-sm text-gray-500">{me.email}</div>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                {ROLE_LABEL[me.role]}
              </span>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <div className="mb-3 text-sm font-semibold text-gray-900">Edit profile</div>
              <ProfileForm initialName={me.name} />
            </div>

            <div className="mt-5 border-t border-gray-100 pt-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="mb-1 text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                    Email
                  </div>
                  <div className="text-gray-700 select-text">{me.email}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                    Role
                  </div>
                  <div className="text-gray-700">{ROLE_LABEL[me.role]}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-1 text-sm font-semibold text-gray-900">Change password</div>
            <p className="mb-4 text-xs text-gray-500">
              Pick a new password — at least 8 characters. You&rsquo;ll stay signed in on this
              device.
            </p>
            <ChangePasswordForm />
          </section>

          <section className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-1 text-sm font-semibold text-gray-900">Sign out</div>
            <p className="mb-4 text-xs text-gray-500">
              Ends your session on this device. You&rsquo;ll be returned to the sign-in page.
            </p>
            <SignOutButton />
          </section>
        </div>
      </main>
    </>
  );
}
