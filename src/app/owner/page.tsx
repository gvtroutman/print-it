import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/authz";
import { adminPassword } from "@/lib/identity-token";
import { safeRedirect } from "@/lib/safe-redirect";
import { unlockOwnerPages } from "@/app/actions/identity";
import { AuthShell, Button, H1, Input, Kicker, Label, Lead, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That is not the owner password.",
  slow: "Too many wrong guesses. Wait a minute and try again.",
  unset: "ADMIN_PASSWORD is not set on the server, so the owner pages are switched off.",
  noowner: "There is no printer owner yet. Run the database seed first.",
};

/**
 * The one password left in the app: `ADMIN_PASSWORD`, which unlocks the
 * owner pages for the rest of this browser session.
 */
export default async function OwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeRedirect(rawNext, "/queue");

  const user = await currentUser();
  if (user?.role === "admin") redirect(next);

  return (
    <AuthShell>
      <Kicker>Behind the counter</Kicker>
      <H1>Owner pages</H1>
      <Lead>Enter the owner password to run the queue, the catalog and the books.</Lead>

      {(error || !adminPassword()) && (
        <div className="mb-[22px]">
          <Notice tone="warn">{ERRORS[error ?? "unset"] ?? ERRORS.wrong}</Notice>
        </div>
      )}

      <form action={unlockOwnerPages} className="flex flex-col gap-[13.2px]">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="password">Owner password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full">
          Unlock
        </Button>
      </form>

      <p className="m-0 mt-[22px] border-t-2 border-dashed border-rule pt-[13.2px] text-[13.5px] leading-[1.5] text-ink-2">
        Just here to order a print?{" "}
        <Link href="/hello" className="font-bold text-cherry-dk underline underline-offset-2">
          Pick your name instead
        </Link>
        .
      </p>
    </AuthShell>
  );
}
