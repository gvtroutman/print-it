import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { PhoneInstall } from "@/components/phone-app";
import { Brand, Kicker } from "@/components/ui";
import { currentUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function InstallPage() {
  const user = await currentUser();
  return <>
    {user ? <AppHeader user={user} active="/install" /> : <header className="mx-auto w-full max-w-[760px] px-[22px] pt-[24px]"><Link href="/"><Brand /></Link></header>}
    <main className="mx-auto w-full max-w-[760px] px-[22px] pb-[80px] pt-[35px]">
      <Kicker>Your phone · your filament finds</Kicker>
      <h1 className="m-0 mb-[24px] text-[38px] leading-[1.1] text-ink">Take Print It! with you</h1>
      <PhoneInstall />
      <div className="mt-[24px] flex flex-wrap gap-[18px] text-[15px] font-bold text-ink-2">
        {(!user || user.role === "admin") && <Link href="/share-filament" className="underline underline-offset-4">Add Amazon filament →</Link>}
        <Link href="/" className="underline underline-offset-4">Back to Print It!</Link>
      </div>
    </main>
  </>;
}
