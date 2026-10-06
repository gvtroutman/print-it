import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/authz";
import { NAME_MAX } from "@/lib/identity-rules";
import { safeRedirect } from "@/lib/safe-redirect";
import { addName, pickName } from "@/app/actions/identity";
import { AuthShell, Button, H1, Input, Kicker, Label, Lead, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  unknown: "That name is not on the list any more. Pick another or add yours.",
  name: `A name is between 1 and ${NAME_MAX} characters.`,
  owner: "That name belongs to the printer owner. Pick a different one.",
};

/**
 * The front door. No sign-in: pick your name from the list, or add it.
 * The choice is remembered on this device until you say "Not you?".
 */
export default async function HelloPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeRedirect(rawNext);

  const user = await currentUser();
  if (user) redirect(next);

  const people = await db.user.findMany({
    where: { role: "client" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, initials: true },
  });

  return (
    <AuthShell>
      <Kicker>Pull up a stool</Kicker>
      <H1>Who&rsquo;s ordering?</H1>
      <Lead>Pick your name, or add it if this is your first time here.</Lead>

      {error && (
        <div className="mb-[22px]">
          <Notice tone="warn">{ERRORS[error] ?? "That did not go through. Try again."}</Notice>
        </div>
      )}

      {people.length > 0 && (
        <form action={pickName} className="mb-[22px] flex flex-wrap gap-[8.8px]">
          <input type="hidden" name="next" value={next} />
          {people.map((p) => (
            <button
              key={p.id}
              type="submit"
              name="userId"
              value={p.id}
              className="stamp flex cursor-pointer items-center gap-[8.8px] rounded-chip border-[3px] border-ink bg-porcelain py-[6px] pl-[6px] pr-[15px] text-[15px] font-bold text-ink hover:bg-sun"
            >
              <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 border-ink bg-aqua font-mono text-[11px]">
                {p.initials}
              </span>
              {p.name}
            </button>
          ))}
        </form>
      )}

      <form action={addName} className="flex flex-col gap-[13.2px]">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="name">{people.length > 0 ? "Not on the list?" : "Your name"}</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={NAME_MAX}
            autoComplete="name"
            placeholder="Ayla Berg"
          />
        </div>
        <Button type="submit" variant={people.length > 0 ? "secondary" : "primary"} className="w-full">
          That&rsquo;s me
        </Button>
      </form>

      <p className="m-0 mt-[22px] border-t-2 border-dashed border-rule pt-[13.2px] text-[13.5px] leading-[1.5] text-ink-2">
        Run the printer?{" "}
        <Link href="/owner" className="font-bold text-cherry-dk underline underline-offset-2">
          Unlock the owner pages
        </Link>
        .
      </p>
    </AuthShell>
  );
}
