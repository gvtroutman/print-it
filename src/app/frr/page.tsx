import Link from "next/link";

import { requireUser, printerName } from "@/lib/authz";
import { FEATURE_BOARD, featureLabel } from "@/lib/scope";
import { coerceFeatureFilter, hasFeatureFilter, listFeatures } from "@/lib/features";
import { AppHeader } from "@/components/app-header";
import { FeatureCard } from "@/components/feature-card";
import { FeatureFilterBar } from "@/components/feature-filter";
import { MemberFeatureRequests } from "@/components/member-feature-requests";
import { Kicker } from "@/components/ui";
import { Toast } from "@/components/toast";
import { FeaturePanels } from "./feature-panels";

export const dynamic = "force-dynamic";

/**
 * Members see a simple request list; the owner retains the stage board.
 * Done and Declined requests stay available as history in either view.
 *
 * Scoped by `featureScope` in the query: a client sees only their own
 * requests, the owner sees everyone's.
 */
const RAIL: Record<string, { color: string; note: string }> = {
  Requested: { color: "bg-cream-2", note: "Waiting for review" },
  Accepted: { color: "bg-aqua-wash", note: "Agreed and queued" },
  InProgress: { color: "bg-sun-wash", note: "Being built" },
  Shipped: { color: "bg-cherry-wash", note: "Released and ready to check" },
  Closed: { color: "bg-mint-wash", note: "Done or declined" },
};

export default async function FeatureBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string; priority?: string; status?: string; category?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireUser("/frr")]);
  const { toast } = params;
  const owner = await printerName();

  const filter = coerceFeatureFilter(params);
  const features = await listFeatures(user, filter);
  const filtered = hasFeatureFilter(filter);
  const isAdmin = user.role === "admin";

  return (
    <>
      <AppHeader user={user} active="/frr" />

      <main className={`mx-auto w-full px-[20px] pb-[80px] pt-[35.2px] sm:px-[26.4px] ${isAdmin ? "max-w-[1660px]" : "max-w-[780px]"}`}>
        <div className="mb-[26.4px] flex flex-wrap items-end justify-between gap-[13.2px]">
          <div>
            <Kicker>Feature requests</Kicker>
            <h1 className="m-0 mt-[6px] font-display text-[30px] leading-[1.05] text-ink">
              {isAdmin ? "Everything asked for" : "My feature requests"}
            </h1>
            <p className="m-0 mt-[8px] max-w-[60ch] text-[15px] text-ink-2">
              {isAdmin
                ? `Ask for a change to Print It!, and follow it through the same stages a print goes through. ${owner} sees each one and moves it along.`
                : `Have an idea or spotted a problem? Send it to ${owner} and follow the replies here.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[8.8px]">
            {/* The owner's triage view. The nav points at this board rather
                than at the queue, so without this the queue would be reachable
                only by typing the URL. */}
            {isAdmin && (
              <Link
                href="/frr/queue"
                className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-porcelain px-[18px] py-[11px] text-[15px] font-bold text-ink hover:bg-sun"
              >
                Triage
              </Link>
            )}
            <Link
              href="/frr/new"
              className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-cherry-dk px-[22px] py-[11px] text-[15px] font-bold text-cream hover:bg-cherry"
            >
              {isAdmin ? "+ New request" : "+ Suggest a change"}
            </Link>
          </div>
        </div>

        {!isAdmin ? <MemberFeatureRequests features={features} filter={filter} /> : <>
          <FeatureFilterBar action="/frr" filter={filter} />

          {features.length === 0 && (
            <div className="mb-[22px] rounded-panel border-[3px] border-dashed border-ink-3 bg-cream-2 px-[26.4px] py-[35.2px] text-center">
              {filtered ? (
                <>
                  <p className="m-0 font-display text-[19px] text-ink">Nothing matches those filters</p>
                  <p className="m-0 mt-[6px] text-[15px] text-ink-2">
                    <Link href="/frr" className="underline underline-offset-2 hover:text-cherry-dk">
                      Clear the filters
                    </Link>{" "}
                    to see everything.
                  </p>
                </>
              ) : (
                <>
                  <p className="m-0 font-display text-[19px] text-ink">Nothing here yet</p>
                  <p className="m-0 mt-[6px] text-[15px] text-ink-2">
                    The first idea goes on the board the moment you file it.
                  </p>
                </>
              )}
            </div>
          )}

          <FeaturePanels
            key={[filter.priority, filter.status, filter.category].join("|")}
            filtered={filtered}
            panels={[...FEATURE_BOARD, "Closed" as const].map(status => {
              const rail = RAIL[status]!;
              const items = features.filter(f => status === "Closed" ? f.status === "Done" || f.status === "Declined" : f.status === status);
              return {
                key: status,
                label: status === "Closed" ? "Closed" : featureLabel(status),
                hint: rail.note,
                color: rail.color,
                count: items.length,
                content: items.map(f => <FeatureCard key={f.id} feature={f} showRequester />),
              };
            })}
          />
        </>}
      </main>

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
