import Link from "next/link";

import { contactEmail } from "@/lib/contact-email";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/scope";
import { relativeTime } from "@/lib/catalog";
import { notificationScope } from "@/lib/notifications";
import { Brand } from "@/components/ui";
import { ActivityMenu, type FeedItem } from "@/components/activity-menu";
import { UserMenu } from "@/components/user-menu";
import { MobileMenu, type NavGroup } from "@/components/mobile-menu";
import { NavIcon } from "@/components/nav-icons";
import { PasskeyNudge } from "@/components/passkey-nudge";
import { BadgeAwardListener } from "@/components/badge-award-listener";
import { maintenanceStatus } from "@/lib/maintenance";
import { MaintenanceWatch } from "@/components/maintenance-watch";

/** Keep each role's navigation in one unlabelled group. */
const NAV: Record<Actor["role"], NavGroup[]> = {
  client: [
    {
      items: [
        { label: "New order", href: "/upload", icon: "plus" },
        { label: "My orders", href: "/me", icon: "stack" },
        { label: "Features", href: "/frr", icon: "bulb" },
        { label: "Donate", href: "/bin", icon: "jar" },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: "To do", href: "/queue", icon: "check" },
        { label: "All orders", href: "/me", icon: "stack" },
        // The board, not the triage queue: the owner wants to see everything
        // that has been asked for, and triage is one button away on that page.
        { label: "Features", href: "/frr", icon: "bulb" },
        // Pledges wait here for the owner to say the money arrived.
        { label: "Donate", href: "/bin", icon: "jar" },
        { label: "Library colors", href: "/admin/catalog", icon: "spool" },
        { label: "Members", href: "/admin/invites", icon: "people" },
        // The audit log is in the Notifications menu, with History: it is the
        // record of what happened, not a place the work lives.
      ],
    },
  ],
};

/**
 * The sign over the counter, on every screen.
 *
 * Wrinkled kraft paper under the wordmark, with ink text on it (`kraft` in
 * globals.css on a phone, the seamless `kraft-tile` from `sm` up).
 * `data-authenticated` is a stable hook for the test suites so they assert on
 * "there is a signed-in shell here" rather than on a piece of copy that a
 * redesign can move — which is exactly what went wrong before.
 */
export async function AppHeader({
  user,
  active,
  sticky = true,
  celebrations = true,
}: {
  user: Actor;
  active: string;
  sticky?: boolean;
  celebrations?: boolean;
}) {
  const maintenance = user.role === "admin" ? await maintenanceStatus() : null;
  const [notifications, passkeyCount, awards] = await Promise.all([
    db.notification.findMany({
      where: notificationScope(user),
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.passkey.count({ where: { userId: user.id } }),
    celebrations && user.stickersEnabled !== false ? db.notification.findMany({
      where: { recipientId: user.id, read: false, badgeKey: { not: null } },
      select: { id: true, badgeKey: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }) : [],
  ]);

  const items: FeedItem[] = notifications.map((n) => ({
    id: n.id,
    text: n.text,
    when: relativeTime(n.createdAt),
    read: n.read,
    storyId: n.storyId,
    featureId: n.featureId,
    badgeKey: n.badgeKey,
  }));
  const unread = items.filter((i) => !i.read).length;

  return (
    <header data-authenticated="true" className={`${sticky ? "sticky top-0" : "relative"} z-40`}>
      {user.role !== "admin" && <MaintenanceWatch />}
      {maintenance?.enabled && <div className="border-b-2 border-ink bg-sun px-4 py-3 text-center text-sm font-bold" role="status">Maintenance mode is on · members see the printer repair notice. <Link href="/admin/maintenance" className="underline underline-offset-4">Manage maintenance</Link></div>}
      {celebrations && user.stickersEnabled !== false && <BadgeAwardListener key={user.id} awards={awards} userId={user.id} />}
      <div className="kraft sm:kraft-tile border-b-[3px] border-ink">
        {/* Equal desktop side columns keep the four member buttons centred
            between the larger wordmark and account controls. */}
        <div className={`mx-auto max-w-[1180px] px-[16px] py-[22px] sm:px-[26.4px] sm:py-[13.2px] ${user.role === "admin" ? "lg:max-w-[1536px]" : ""}`}>
          {/* On a phone the kraft band is the sign alone: the wordmark
              centred with room around it, at most 389px wide (2.4× its
              desktop width) and never more than 80% of the screen. The menus
              move to the bar below. */}
          <div className={`flex flex-wrap items-center gap-x-[16px] gap-y-[11px] max-sm:justify-center lg:gap-x-[22px] ${user.role === "client" ? "lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : "lg:flex-nowrap lg:max-xl:gap-x-[12px]"}`}>
            <Link
              href={user.role === "admin" ? "/queue" : "/upload"}
              aria-label="Print It!, home"
              className="block shrink-0 max-sm:w-[80%] max-sm:max-w-[389px] lg:justify-self-start"
            >
              <Brand size={34} className={`max-sm:h-auto max-sm:w-full lg:h-auto xl:w-[204px] ${user.role === "client" ? "lg:w-[176px]" : "lg:w-[152px]"}`} />
            </Link>

            <nav className={`order-last flex w-full flex-wrap items-center gap-x-[22px] gap-y-[8px] max-sm:hidden lg:order-none lg:w-auto lg:flex-1 lg:flex-nowrap ${user.role === "client" ? "lg:justify-center" : "lg:max-xl:gap-x-[12px]"}`}>
              {NAV[user.role].map((group, i) => (
                <div
                  key={group.heading ?? i}
                  role={group.heading ? "group" : undefined}
                  aria-label={group.heading}
                  className={`flex flex-wrap items-center gap-[6px] lg:flex-nowrap lg:max-2xl:gap-[2px] ${
                    i > 0 ? "border-l-2 border-ink pl-[22px] lg:border-l-0 lg:pl-0" : ""
                  }`}
                >
                  {group.heading && (
                    <span
                      aria-hidden
                      className="mr-[4px] font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink lg:hidden"
                    >
                      {group.heading}
                    </span>
                  )}
                  {group.items.map((item) => {
                    const current = item.href === active;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={`flex items-center gap-[10px] rounded-chip border-2 px-[13px] py-[8px] font-mono text-[12.5px] font-bold uppercase tracking-[0.08em] transition-colors sm:px-[15px] sm:py-[7px] lg:whitespace-nowrap ${user.role === "admin" ? "lg:gap-[4px] lg:px-[5px] lg:text-[11px] 2xl:gap-[10px] 2xl:px-[15px] 2xl:text-[12.5px]" : "lg:max-xl:gap-[8px] lg:max-xl:px-[8px]"} ${
                          current
                            ? "border-ink bg-sun text-ink"
                            : "border-transparent text-ink hover:border-ink hover:bg-cream-2"
                        }`}
                      >
                        <NavIcon
                          name={item.icon}
                          size={36}
                          className={user.role === "admin" ? "lg:max-2xl:h-[28px]! lg:max-2xl:w-[28px]!" : ""}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-[13.2px] max-sm:hidden lg:justify-self-end">
              <ActivityMenu
                items={items}
                unread={unread}
                title="Notifications"
                role={user.role}
              />
              <UserMenu
                name={user.name}
                initials={user.initials}
                email={contactEmail(user.email)}
                joinedAt={user.joinedAt}
                flair={user.cardFlair}
                role={user.role}
                previewing={user.previewing === true}
              />
            </div>
          </div>
        </div>
      </div>

      {/* The phone's second bar: the hamburger (tabs and account) centred
          under the wordmark, activity on the right. The empty first column
          balances the last so the hamburger sits on the true centre. Above
          `sm` both live in the band. */}
      <div className="border-b-[3px] border-ink bg-cream-2 sm:hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-[16px] py-[8.8px]">
          <span aria-hidden />
          <MobileMenu
            nav={NAV[user.role]}
            active={active}
            name={user.name}
            initials={user.initials}
            email={contactEmail(user.email)}
            joinedAt={user.joinedAt}
            flair={user.cardFlair}
            role={user.role}
            previewing={user.previewing === true}
          />
          <div className="justify-self-end">
            <ActivityMenu
              items={items}
              unread={unread}
              title="Notifications"
              role={user.role}
            />
          </div>
        </div>
      </div>

      {/* Members have no password to be tired of typing — their device is
          their sign-in — so the nudge is for the printer owner alone. */}
      {user.role === "admin" && passkeyCount === 0 && <PasskeyNudge />}
    </header>
  );
}
