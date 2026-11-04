import Link from "next/link";

import { relativeTime } from "@/lib/catalog";
import { featureRef } from "@/lib/scope";
import { hasFeatureFilter, type FeatureFilter, type FeatureRow } from "@/lib/features";
import { MEMBER_FEATURE_STATUS } from "@/lib/feature-presentation";
import { FeatureFilterBar } from "@/components/feature-filter";
import { StatusChip } from "@/components/ui";

function RequestList({ features }: { features: FeatureRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-[13.2px] p-0">
      {features.map((feature) => (
        <li key={feature.id}>
          <Link
            href={`/frr/${feature.id}`}
            className="group block rounded-card border-2 border-ink bg-porcelain p-[17.6px] transition-colors hover:bg-aqua-wash sm:p-[22px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <StatusChip status={feature.status} label={MEMBER_FEATURE_STATUS[feature.status].label} />
              <span className="text-[12px] text-ink-2">{relativeTime(feature.createdAt)}</span>
            </div>
            <h2 className="m-0 mt-[11px] break-words font-display text-[19px] leading-[1.3] text-ink group-hover:underline">
              {feature.title}
            </h2>
            <p className="m-0 mt-[6px] line-clamp-2 break-words text-[14px] leading-[1.5] text-ink-2">
              {feature.description}
            </p>
            <div className="mt-[13.2px] flex flex-wrap items-center justify-between gap-[8px] text-[12px] text-ink-2">
              <span>
                {featureRef(feature.id)}
                {feature._count.comments > 0 && ` · ${feature._count.comments} ${feature._count.comments === 1 ? "reply" : "replies"}`}
              </span>
              <span className="font-bold text-ink">View request <span aria-hidden>→</span></span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Members follow their own requests in a list, without learning the triage board. */
export function MemberFeatureRequests({ features, filter }: { features: FeatureRow[]; filter: FeatureFilter }) {
  const filtered = hasFeatureFilter(filter);
  const active = features.filter((feature) => feature.status !== "Done" && feature.status !== "Declined");
  const closed = features.filter((feature) => feature.status === "Done" || feature.status === "Declined");

  return (
    <>
      {(features.length > 0 || filtered) && (
        <details open={filtered} className="mb-[22px]">
          <summary className="w-fit cursor-pointer py-[8px] text-[14px] font-bold text-ink-2">
            {filtered ? "Filters applied" : "Filter requests"}
          </summary>
          <div className="mt-[8px]">
            <FeatureFilterBar action="/frr" filter={filter} memberView />
          </div>
        </details>
      )}

      {features.length === 0 ? (
        <div className="rounded-panel border-2 border-dashed border-ink-3 bg-porcelain px-[22px] py-[35.2px] text-center">
          <h2 className="m-0 font-display text-[21px] text-ink">
            {filtered ? "No matching requests" : "Have an idea?"}
          </h2>
          <p className="m-0 mt-[8px] text-[15px] leading-[1.5] text-ink-2">
            {filtered ? (
              <Link href="/frr" className="underline underline-offset-2 hover:text-cherry-dk">Clear filters to see your requests.</Link>
            ) : "Suggest a change or report a problem. Your requests and replies will appear here."}
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <section aria-label="Open requests">
              <RequestList features={active} />
            </section>
          ) : !filtered && (
            <p className="m-0 text-[15px] text-ink-2">You have no open requests.</p>
          )}
          {closed.length > 0 && (
            <details open={filtered} className="mt-[26.4px]">
              <summary className="w-fit cursor-pointer py-[8px] font-display text-[18px] text-ink">
                Past requests ({closed.length})
              </summary>
              <div className="mt-[13.2px]">
                <RequestList features={closed} />
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}
