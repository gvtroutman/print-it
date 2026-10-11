import { notFound } from "next/navigation";

import { requireUser } from "@/lib/authz";
import { contactEmail } from "@/lib/contact-email";
import { DEVICE_LINK_TTL_MINUTES } from "@/lib/device-link";
import { AppHeader } from "@/components/app-header";
import { Kicker } from "@/components/ui";
import { SelfDeviceLink } from "./self-device-link";

export const dynamic = "force-dynamic";

/**
 * "Add device", for a member the printer owner has switched it on for.
 *
 * A member has no password, so a second device gets in on a single-use link.
 * This mints one for the member themselves, where before only the owner
 * could. Same link, same audit row, same expiry — the only difference is who
 * pressed the button. 404 when the switch is off.
 */
export default async function AddDevicePage() {
  const user = await requireUser("/add-device");
  if (!user.canAddDevice) notFound();

  return (
    <>
      <AppHeader user={user} active="/add-device" />

      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <Kicker>New phone, who dis</Kicker>
        <h1 className="m-0 mb-[13.2px] text-[46px] leading-[0.98] text-ink">Add a device</h1>
        <p className="m-0 mb-[26.4px] max-w-[620px] text-[16.5px] leading-[1.5] text-ink-2 text-pretty">
          This device keeps you signed in. To use another one too, make a link
          here and open it there: it signs that device in as you, works once,
          and expires in {DEVICE_LINK_TTL_MINUTES} minutes. The one you are on
          stays signed in.
        </p>

        <SelfDeviceLink
          hasEmail={contactEmail(user.email) !== null}
          expiresInMinutes={DEVICE_LINK_TTL_MINUTES}
        />
      </main>
    </>
  );
}
