import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { AppHeader } from "@/components/app-header";
import { BadgeAnimationLab } from "@/components/badge-animation-lab";

export const dynamic = "force-dynamic";

export default async function BadgeAnimationPage() {
  const user = await requireUser("/member/badge-preview");
  // The owner can test every design, including hidden discoveries, in either view.
  if (user.role !== "admin" && !user.previewing) notFound();
  return <>
    <AppHeader user={user} active="/member" celebrations={false} />
    <main className="mx-auto w-full max-w-[900px] px-[16px] pb-[80px] sm:px-[26.4px]"><BadgeAnimationLab /></main>
  </>;
}
