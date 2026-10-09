import Link from "next/link";

import { contactEmail } from "@/lib/contact-email";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/scope";
import { relativeTime } from "@/lib/catalog";
import { Brand } from "@/components/ui";
import { ActivityMenu, type FeedItem } from "@/components/activity-menu";
import { UserMenu } from "@/components/user-menu";
import { MobileMenu, type NavGroup } from "@/components/mobile-menu";
import { NavIcon } from "@/components/nav-icons";
import { PasskeyNudge } from "@/components/passkey-nudge";

/**
 * The owner's menu is split in two and named plainly: the day-to-day print
 * work first, then the setup pages that are visited once in a while. Members
 * have few enough destinations that one unlabelled group reads fine.
 */
const NAV: Record<Actor["role"], NavGroup[]> = {
  client: [
    {
      items: [
        { label: "New order", href: "/upload", icon: "plus" },
        { label: "My orders", href: "/me", icon: "stack" },
        { label: "Feature requests", href: "/frr", icon: "bulb" },
        { label: "Donation bin", href: "/bin", icon: "jar" },
      ],
    },
  ],
  admin: [
    {
      heading: "Prints",
      items: [
        { label: "To do", href: "/queue", icon: "check" },
        { label: "All orders", href: "/me", icon: "stack" },
        { label: "By person", href: "/admin/prints", icon: "person" },
        // The board, not the triage queue: the owner wants to see everything
        // that has been asked for, and triage is one button away on that page.
        { label: "Feature requests", href: "/frr", icon: "bulb" },
        // Pledges wait here for the owner to say the money arrived.
        { label: "Donation bin", href: "/bin", icon: "jar" },
      ],
    },
    {
      heading: "Setup",
      items: [
        { label: "Materials", href: "/admin/catalog", icon: "spool" },
        { label: "Members", href: "/admin/invites", icon: "people" },
        // The audit log is in the Activity menu, with History: it is the
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
}: {
  user: Actor;
  active: string;
}) {
  const [notifications, passkeyCount] = await Promise.all([
    db.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.passkey.count({ where: { userId: user.id } }),
  ]);

  const items: FeedItem[] = notifications.map((n) => ({
    id: n.id,
    text: n.text,
    when: relativeTime(n.createdAt),
    read: n.read,
    storyId: n.storyId,
    featureId: n.featureId,
  }));
  const unread = items.filter((i) => !i.read).length;

  return (
    <header data-authenticated="true" className="sticky top-0 z-40">
      <div className="kraft sm:kraft-tile border-b-[3px] border-ink">
        {/* Keep identity and account controls on a stable top row. Navigation
            has its own wrapping row, so adding destinations cannot push the
            activity or profile menus away from the wordmark. */}
        <div className="mx-auto max-w-[1180px] px-[16px] py-[22px] sm:px-[26.4px] sm:py-[13.2px]">
          {/* On a phone the kraft band is the sign alone: the wordmark
              centred with room around it, at most 389px wide (2.4× its
              desktop width) and never more than 80% of the screen. The menus
              move to the bar below. */}
          <div className="flex items-center gap-[16px] max-sm:justify-center lg:gap-[22px]">
            <Link
              href={user.role === "admin" ? "/queue" : "/upload"}
              aria-label="Print It!, home"
              className="block max-sm:w-[80%] max-sm:max-w-[389px]"
            >
              <Brand size={34} className="max-sm:h-auto max-sm:w-full" />
            </Link>

            <div className="ml-auto flex items-center gap-[13.2px] max-sm:hidden">
              <ActivityMenu
                items={items}
                unread={unread}
                title={user.role === "admin" ? "New from the group" : "Updates on your prints"}
                role={user.role}
              />
              <UserMenu
                name={user.name}
                initials={user.initials}
                email={contactEmail(user.email)}
                role={user.role}
                passkeyCount={passkeyCount}
                previewing={user.previewing === true}
              />
            </div>
          </div>

          <nav className="mt-[11px] flex flex-wrap items-center gap-x-[22px] gap-y-[8px] max-sm:hidden">
            {NAV[user.role].map((group, i) => (
              <div
                key={group.heading ?? i}
                role={group.heading ? "group" : undefined}
                aria-label={group.heading}
                className={`flex flex-wrap items-center gap-[6px] ${
                  i > 0 ? "border-l-2 border-ink pl-[22px]" : ""
                }`}
              >
                {group.heading && (
                  <span
                    aria-hidden
                    className="mr-[4px] font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink"
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
                      className={`flex items-center gap-[8px] rounded-chip border-2 px-[13px] py-[8px] font-mono text-[12.5px] font-bold uppercase tracking-[0.08em] transition-colors sm:px-[15px] sm:py-[7px] ${
                        current
                          ? "border-ink bg-sun text-ink"
                          : "border-transparent text-ink hover:border-ink hover:bg-cream-2"
                      }`}
                    >
                      <NavIcon name={item.icon} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
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
            role={user.role}
            passkeyCount={passkeyCount}
            previewing={user.previewing === true}
          />
          <div className="justify-self-end">
            <ActivityMenu
              items={items}
              unread={unread}
              title={user.role === "admin" ? "New from the group" : "Updates on your prints"}
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
