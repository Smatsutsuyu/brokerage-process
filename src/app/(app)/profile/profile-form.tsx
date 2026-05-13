"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateMyProfile } from "./actions";

type ProfileFormProps = {
  initialName: string;
  initialPhone: string | null;
};

export function ProfileForm({ initialName, initialPhone }: ProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = name !== initialName || phone !== (initialPhone ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await updateMyProfile({ name, phone: phone || null });
        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save changes.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSuccess(false);
          }}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="profile-phone">Phone</Label>
        <Input
          id="profile-phone"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSuccess(false);
          }}
          placeholder="Optional"
        />
        <p className="text-[11px] text-gray-500">
          Surfaces in the Deal Team Roster when you&apos;re added to a
          broker team.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {success && !isDirty && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Profile updated.
        </div>
      )}

      <div>
        <Button type="submit" disabled={isPending || !isDirty}>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
