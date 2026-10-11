import { notFound } from "next/navigation";

import { requireUser } from "@/lib/authz";
import { INVITE_TTL_DAYS } from "@/lib/invites";
import { AppHeader } from "@/components/app-header";
import { Kicker } from "@/components/ui";
import { InviteForm } from "@/app/admin/invites/invite-form";

export const dynamic = "force-dynamic";

/**
 * "Add member", for a member the printer owner has switched it on for.
 *
 * The owner's invite form, and nothing else from the guest list: no roster,
 * no outstanding invitations, none of the controls. The invitation carries
 * this member's name as the inviter, and the owner sees it on their own list
 * like any other. 404 rather than 403 when the switch is off, as every
 * surface somebody may not have answers here.
 */
export default async function AddMemberPage() {
  const user = await requireUser("/add-member");
  if (!user.canAddMember) notFound();

  return (
    <>
      <AppHeader user={user} active="/add-member" />

      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <Kicker>Bring a friend</Kicker>
        <h1 className="m-0 mb-[13.2px] text-[46px] leading-[0.98] text-ink">Add a member</h1>
        <p className="m-0 mb-[26.4px] max-w-[620px] text-[16.5px] leading-[1.5] text-ink-2 text-pretty">
          Somebody else who should be able to send prints. They get a link that
          works once and expires after {INVITE_TTL_DAYS} days, and the printer
          owner sees the invitation on the guest list with your name on it.
        </p>

        <InviteForm />
      </main>
    </>
  );
}
