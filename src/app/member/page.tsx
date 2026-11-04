import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { MemberCardEditor } from "@/components/member-card-editor";
import { MemberDonation } from "@/components/member-donation";
import { MemberBadges } from "@/components/member-badges";
import { MemberStickerPreference } from "@/components/member-sticker-preference";
import { PhoneInstallAction } from "@/components/phone-app";
import { NavIcon, type NavIconName } from "@/components/nav-icons";
import { SignOut } from "@/components/sign-out";
import { Notice } from "@/components/ui";
import { Toast } from "@/components/toast";
import { requireUser } from "@/lib/authz";
import { isCardFlair } from "@/lib/card-flair";
import { AUTO_MATERIAL } from "@/lib/catalog";
import { contactEmail } from "@/lib/contact-email";
import { db } from "@/lib/db";
import { PrinterHours } from "./printer-hours";

export const dynamic = "force-dynamic";

export default async function MemberPage({ searchParams }: {
  searchParams: Promise<{ toast?: string; error?: string }>;
}) {
  const [user, { toast, error }] = await Promise.all([requireUser("/member"), searchParams]);
  const isAdmin = user.role === "admin";
  const [passkeyCount, earned, member, availableMaterials, completedUsage] = await Promise.all([
    isAdmin ? db.passkey.count({ where: { userId: user.id } }) : 0,
    db.memberBadge.findMany({
      where: { userId: user.id },
      select: { badgeKey: true, earnedAt: true },
    }),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { createdAt: true, printSubmissionCount: true, fiberSubmissionCount: true, requestedMaterialIds: true, hasDonated: true, cardFlair: true, previewCardFlair: true },
    }),
    isAdmin ? [] : db.catalogMaterial.findMany({
      where: { active: true, name: { not: AUTO_MATERIAL }, colors: { some: { active: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    isAdmin ? null : db.story.aggregate({
      where: { uploaderId: user.id, status: { in: ["Delivery", "Done"] } },
      _sum: { filamentMeters: true },
      _count: { _all: true },
    }),
  ]);
  const alternateFlair = isAdmin ? member.previewCardFlair : member.cardFlair;
  const alternateCard = isAdmin || user.previewing ? {
    name: isAdmin ? "Member" : "Admin",
    initials: isAdmin ? "ME" : "AD",
    email: contactEmail(user.email),
    joinedAt: user.joinedAt,
    role: isAdmin ? "client" as const : "admin" as const,
    previewing: isAdmin,
    flair: isCardFlair(alternateFlair) && earned.some(badge => badge.badgeKey === alternateFlair) ? alternateFlair : null,
  } : undefined;
  const actions: Array<{ title: string; href: string; icon: NavIconName }> = [
    {
      title: "Install on your phone",
      href: "/install",
      icon: "plus",
    },
  ];
  if (user.canAddDevice) actions.push({
    title: "Add device",
    href: "/add-device",
    icon: "send",
  });
  if (user.canAddMember) actions.push({
    title: "Add member",
    href: isAdmin ? "/admin/invites" : "/add-member",
    icon: "people",
  });
  if (isAdmin) actions.push({
    title: "Add Amazon filament",
    href: "/share-filament",
    icon: "spool",
  }, {
    title: "Maintenance mode",
    href: "/admin/maintenance",
    icon: "check",
  });

  return (
    <>
      <AppHeader user={user} active="/member" />
      <main className="mx-auto w-full max-w-[900px] px-[16px] pb-[80px] pt-[35.2px] sm:px-[26.4px]">
        <h1 className="sr-only">{isAdmin ? "Admin" : "Member"}</h1>

        {isAdmin && error && <div className="mb-[20px]"><Notice tone="warn">{error}</Notice></div>}

        <MemberCardEditor
          key={user.previewing ? "member-preview" : "account"}
          earnedBadgeKeys={earned.map((badge) => badge.badgeKey)}
          stickersEnabled={user.stickersEnabled !== false}
          name={user.name}
          initials={user.initials}
          email={contactEmail(user.email)}
          joinedAt={user.joinedAt}
          flair={user.cardFlair}
          role={user.role}
          previewing={user.previewing}
          alternateCard={alternateCard}
        />

        {user.previewing && (
          <section className="mt-[17.6px] rounded-panel border-[3px] border-ink bg-cream-2 p-[17.6px]">
            <MemberDonation userId={user.id} name="Member preview" hasDonated={member.hasDonated} preview />
            <p className="mb-0 mt-[8px] text-[13px] leading-[1.5] text-ink-2">
              Preview a member who has donated. Tick to unlock Store; untick to lock it.
            </p>
          </section>
        )}

        <MemberStickerPreference enabled={user.stickersEnabled !== false} />

        {(isAdmin || user.previewing) && <div className="mt-[17.6px]">
          <Link href="/member/badge-preview" className="font-mono text-[13px] font-bold underline underline-offset-4">Test badge animation →</Link>
        </div>}

        {!isAdmin && user.stickersEnabled !== false && (
          <div className="mt-[26.4px]">
            <MemberBadges earned={earned} progress={{
              joinedAt: member.createdAt,
              completedPrints: completedUsage?._count._all ?? 0,
              completedFilamentMeters: completedUsage?._sum.filamentMeters?.toNumber() ?? 0,
              submissions: member.printSubmissionCount,
              fiberSubmissions: member.fiberSubmissionCount,
              requestedMaterialIds: member.requestedMaterialIds,
              availableMaterials,
            }} />
          </div>
        )}

        <div className="mt-[26.4px] grid grid-cols-1 gap-[12px] sm:gap-[17.6px]">
          {actions.map((action) => {
            const link = <Link
              key={action.href}
              href={action.href}
              className="stamp flex min-w-0 items-center gap-[14px] rounded-panel border-[3px] border-ink bg-porcelain p-[14px] text-ink hover:bg-sun sm:p-[22px]"
            >
              <span className="shrink-0"><NavIcon name={action.icon} size={40} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[18px] leading-[1.15] sm:text-[23px]">{action.title}</span>
              </span>
              <span aria-hidden="true" className="text-[23px]">→</span>
            </Link>;
            return action.href === "/install"
              ? <PhoneInstallAction key={action.href}>{link}</PhoneInstallAction>
              : link;
          })}
          <div>
            <SignOut role={user.role} previewing={user.previewing} />
          </div>
        </div>

        {isAdmin && <div className="mt-[32px]"><PrinterHours /></div>}

        {isAdmin && <section aria-labelledby="sign-in-heading" className="mt-[26.4px] rounded-panel border-[3px] border-ink bg-cream-2 p-[22px]">
          <h2 id="sign-in-heading" className="m-0 mb-[12px] text-[26px] text-ink">Signing in</h2>
          <p className="m-0 text-[15px] leading-[1.5] text-ink-2">
            {passkeyCount === 0 ? "You're signing in with a password." : `${passkeyCount} passkey${passkeyCount === 1 ? "" : "s"} on this account.`}
          </p>
          <Link href="/welcome" className="mt-[8px] inline-block text-[15px] font-bold text-cherry-dk underline underline-offset-2 hover:text-cherry">
            {passkeyCount === 0 ? "Add a passkey →" : "Add another passkey →"}
          </Link>
        </section>}
      </main>
      {isAdmin && toast && <Toast>{toast}</Toast>}
    </>
  );
}
