import Link from "next/link";

import { db } from "@/lib/db";
import type { Actor } from "@/lib/scope";
import { relativeTime } from "@/lib/catalog";
import { Brand } from "@/components/ui";
import { ActivityMenu, type FeedItem } from "@/components/activity-menu";
import { UserMenu } from "@/components/user-menu";
import { PasskeyNudge } from "@/components/passkey-nudge";

/**
 * The sign over the counter, on every screen.
 *
 * Dark ground and a lit wordmark. `data-authenticated` is a stable hook for
 * the test suites so they assert on "there is a signed-in shell here" rather
 * than on a piece of copy that a redesign can move — which is exactly what
 * went wrong before.
 */
type NavGroup = { heading?: string; items: Array<{ label: string; href: string }> };

/**
 * The owner's menu is split in two and named plainly: the day-to-day print
 * work first, then the setup pages that are visited once in a while. Members
 * have few enough destinations that one unlabelled group reads fine.
 */
const NAV: Record<Actor["role"], NavGroup[]> = {
  client: [
    {
      items: [
        { label: "The rail", href: "/board" },
        { label: "Order up", href: "/upload" },
        { label: "My orders", href: "/me" },
        { label: "Feature requests", href: "/frr" },
      ],
    },
  ],
  admin: [
    {
      heading: "Prints",
      items: [
        { label: "To do", href: "/queue" },
        { label: "Board", href: "/board" },
        { label: "All orders", href: "/me" },
        { label: "By person", href: "/admin/prints" },
        // The board, not the triage queue: the owner wants to see everything
        // that has been asked for, and triage is one button away on that page.
        { label: "Feature requests", href: "/frr" },
      ],
    },
    {
      heading: "Setup",
      items: [
        { label: "Materials", href: "/admin/catalog" },
        { label: "Benefits", href: "/admin/benefits" },
        { label: "Members", href: "/admin/invites" },
        { label: "Audit log", href: "/admin/audit" },
      ],
    },
  ],
};

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
      <div className="layers border-b-[3px] border-ink bg-ink">
        {/* Keep identity and account controls on a stable top row. Navigation
            has its own wrapping row, so adding destinations cannot push the
            activity or profile menus away from the wordmark. */}
        <div className="mx-auto max-w-[1180px] px-[16px] py-[11px] sm:px-[26.4px] sm:py-[13.2px]">
          <div className="flex items-center gap-[16px] lg:gap-[22px]">
            <Link href={user.role === "admin" ? "/queue" : "/board"} aria-label="Print It!, home">
              {/* On the dark bar the script reads cream, not cherry. */}
              <span className="[&_span]:text-cream">
                <Brand size={34} />
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-[8.8px] sm:gap-[13.2px]">
              <ActivityMenu
                items={items}
                unread={unread}
                title={user.role === "admin" ? "New from the group" : "Updates on your prints"}
              />
              <UserMenu
                name={user.name}
                initials={user.initials}
                email={user.email}
                role={user.role}
                passkeyCount={passkeyCount}
              />
            </div>
          </div>

          <nav className="mt-[11px] flex flex-wrap items-center gap-x-[22px] gap-y-[8px]">
            {NAV[user.role].map((group, i) => (
              <div
                key={group.heading ?? i}
                role={group.heading ? "group" : undefined}
                aria-label={group.heading}
                className={`flex flex-wrap items-center gap-[6px] ${
                  i > 0 ? "border-l-2 border-ink-2 pl-[22px]" : ""
                }`}
              >
                {group.heading && (
                  <span
                    aria-hidden
                    className="mr-[4px] font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-3"
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
                      className={`rounded-chip border-2 px-[13px] py-[8px] font-mono text-[12.5px] font-bold uppercase tracking-[0.08em] transition-colors sm:px-[15px] sm:py-[7px] ${
                        current
                          ? "border-ink bg-sun text-ink"
                          : "border-transparent text-cream hover:border-ink hover:bg-cream-2 hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Members have no password to be tired of typing — their device is
          their sign-in — so the nudge is for the printer owner alone. */}
      {user.role === "admin" && passkeyCount === 0 && <PasskeyNudge />}
    </header>
  );
}
