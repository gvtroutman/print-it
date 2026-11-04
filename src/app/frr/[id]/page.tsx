import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, printerName } from "@/lib/authz";
import { FEATURE_FLOW, featureLabel, featureRef } from "@/lib/scope";
import { findFeature, listFeatureComments } from "@/lib/features";
import { changeFeaturePriority, withdrawFeature } from "@/app/actions/features";
import { relativeTime, PRIORITY_CHIP, CATEGORY_LABEL, FEATURE_PRIORITIES } from "@/lib/catalog";
import { MEMBER_FEATURE_STATUS } from "@/lib/feature-presentation";
import { AppHeader } from "@/components/app-header";
import { Fact, Notice, StatusChip } from "@/components/ui";
import { FeatureActions } from "@/components/feature-actions";
import { FeatureConversation } from "@/components/feature-conversation";
import { Toast } from "@/components/toast";

export const dynamic = "force-dynamic";

/**
 * A feature request in full — the print `/story/[id]`'s sibling: the ask, where
 * it sits in the flow, the conversation, and (for the owner) the controls to
 * move it along. Scoped by `findFeature`, so a client asking after someone
 * else's request gets 404, not 403.
 */
export default async function FeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string; toast?: string; error?: string }>;
}) {
  const [{ id }, { sent, toast, error }] = await Promise.all([params, searchParams]);
  const featureId = Number(id);
  if (!Number.isInteger(featureId)) notFound();

  const user = await requireUser(`/frr/${id}`);
  // 404 (not 403) for a request that is not the caller's to see — a 403 would
  // confirm it exists. Same decision the story page makes.
  const feature = await findFeature(user, featureId);
  if (!feature) notFound();
  const comments = await listFeatureComments(user, featureId);
  const owner = await printerName();
  const isAdmin = user.role === "admin";
  const memberStatus = MEMBER_FEATURE_STATUS[feature.status];

  const priority = PRIORITY_CHIP[feature.priority] ?? PRIORITY_CHIP.medium!;
  const currentIndex = (FEATURE_FLOW as readonly string[]).indexOf(feature.status);
  const canWithdraw =
    feature.requester.id === user.id &&
    (feature.status === "Requested" || feature.status === "Declined");
  // Reprioritise: the owner on any request, the requester on their own — in
  // any status, a closed request included. Matches `changeFeaturePriority`.
  const canReprioritise =
    user.role === "admin" || feature.requester.id === user.id;

  const requestDetails = (
    <div>
      {isAdmin ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[17.6px]">
          <Fact label="Asked by">{feature.requester.name}</Fact>
          <Fact label="Priority">{priority.label}</Fact>
          <Fact label="Category">{CATEGORY_LABEL[feature.category] ?? feature.category}</Fact>
          <Fact label="Filed">{relativeTime(feature.createdAt)}</Fact>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-ink-2">Category: {CATEGORY_LABEL[feature.category] ?? feature.category}</p>
      )}

      {/* Change the priority after filing. A plain form + submit, so it
          works with JS off; no auto-submit-on-change. */}
      {canReprioritise && (
        <form
          action={changeFeaturePriority}
          className="mt-[17.6px] flex flex-wrap items-end gap-[8.8px] border-t-2 border-dashed border-rule pt-[17.6px]"
        >
          <input type="hidden" name="id" value={feature.id} />
          <input type="hidden" name="from" value={`/frr/${feature.id}`} />
          <div>
            <label
              htmlFor="priority"
              className="mb-[4px] block font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3"
            >
              Change priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={feature.priority}
              className="rounded-card border-[3px] border-ink bg-porcelain px-[13px] py-[8px] text-[15px] font-bold text-ink"
            >
              {FEATURE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_CHIP[p]?.label ?? p}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-aqua px-[18px] py-[9px] text-[14px] font-bold text-ink hover:bg-sun"
          >
            Set
          </button>
        </form>
      )}
    </div>
  );

  const withdrawal = canWithdraw && (
    <form action={withdrawFeature} className="mt-[17.6px]">
      <input type="hidden" name="id" value={feature.id} />
      <details>
        <summary className="w-fit cursor-pointer py-[8px] text-[14px] font-bold text-cherry-dk">
          Withdraw this request
        </summary>
        <div className="mt-[8.8px] rounded-card border-2 border-ink bg-cream-2 p-[13.2px]">
          <p className="m-0 mb-[8px] text-[14px] text-ink-2">
            This removes the request and its conversation. You can withdraw it before it is accepted, or after it is declined.
          </p>
          <button type="submit" className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-cherry-dk px-[15px] py-[8px] text-[14px] font-bold text-cream hover:bg-cherry">
            Yes, withdraw it
          </button>
        </div>
      </details>
    </form>
  );

  return (
    <>
      <AppHeader user={user} active="/frr" />

      <main className={`mx-auto w-full px-[20px] pb-[80px] pt-[35.2px] sm:px-[26.4px] ${isAdmin ? "max-w-[900px]" : "max-w-[780px]"}`}>
        <Link href="/frr" className="inline-block font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink-2 underline underline-offset-4 hover:text-cherry-dk">
          ← Back to requests
        </Link>

        {error && <div className="mt-[17.6px]"><Notice tone="warn">{error}</Notice></div>}

        <div className="mt-[17.6px] mb-[13.2px] flex flex-wrap items-center gap-[8.8px]">
          <span className="text-[12px] font-bold text-ink-2">{featureRef(feature.id)}</span>
          <StatusChip status={feature.status} label={isAdmin ? featureLabel(feature.status) : memberStatus.label} />
          {isAdmin && <>
            <span className={`rounded-chip border-2 border-ink px-[11px] py-[3px] font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink ${priority.bg}`}>
              {priority.label}
            </span>
            <span className="rounded-chip border-2 border-ink bg-aqua-wash px-[11px] py-[3px] font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink">
              {CATEGORY_LABEL[feature.category] ?? feature.category}
            </span>
          </>}
        </div>

        <h1 className="m-0 mb-[13.2px] break-words text-[32px] leading-[1.15] text-ink">{feature.title}</h1>

        {!isAdmin && <p className="m-0 mb-[17.6px] text-[13px] text-ink-2">Sent {relativeTime(feature.createdAt)}</p>}

        {feature.description && (
          <p className="m-0 mb-[22px] whitespace-pre-wrap break-words text-[16px] leading-[1.6] text-ink-2">
            {feature.description}
          </p>
        )}

        {!isAdmin && (
          <p className="m-0 rounded-card border-2 border-rule bg-aqua-wash px-[17.6px] py-[13.2px] text-[15px] leading-[1.5] text-ink">
            {memberStatus.note}
          </p>
        )}

        {isAdmin && <>
          <div className="rounded-panel border-[3px] border-ink bg-porcelain p-[22px] shadow-stamp">{requestDetails}</div>

          <section className="mt-[26.4px]">
            <h2 className="m-0 mb-[13.2px] font-display text-[22px] text-ink">Where it&rsquo;s at</h2>
            {feature.status === "Declined" ? (
              <p className="m-0 rounded-card border-[3px] border-ink bg-cream-3 px-[17.6px] py-[13.2px] text-[15px] text-ink-2">
                This one was declined {relativeTime(feature.updatedAt)}.
              </p>
            ) : (
              <ol className="m-0 flex list-none flex-col p-0">
                {FEATURE_FLOW.map((step, i) => {
                  const done = currentIndex >= 0 && i < currentIndex;
                  const now = i === currentIndex;
                  return (
                    <li key={step} className="flex items-start gap-[13.2px]">
                      <div className="flex flex-none flex-col items-center">
                        <span
                          aria-hidden
                          className={`h-[20px] w-[20px] rounded-full border-[3px] border-ink ${done ? "bg-mint" : now ? "bg-sun" : "bg-cream-3"
                            }`}
                        />
                        {i < FEATURE_FLOW.length - 1 && (
                          <span
                            aria-hidden
                            className={`w-[4px] flex-1 ${done ? "bg-mint" : "bg-cream-3"}`}
                            style={{ minHeight: "26px" }}
                          />
                        )}
                      </div>
                      <div className="pb-[17.6px]">
                        <div className={`font-display text-[17px] ${done || now ? "text-ink" : "text-ink-3"}`}>
                          {featureLabel(step)}
                        </div>
                        <div className="mt-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                          {now ? "now" : done ? "cleared" : "waiting"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {withdrawal}
        </>}

        {user.role === "admin" && (
          <section className="mt-[26.4px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[22px] shadow-stamp">
            <h2 className="m-0 mb-[13.2px] font-display text-[20px] text-ink">
              {feature.status === "Requested" ? "This one needs a yes" : "Move it along"}
            </h2>
            <FeatureActions featureId={feature.id} status={feature.status} from={`/frr/${feature.id}`} />
          </section>
        )}

        <FeatureConversation
          featureId={feature.id}
          comments={comments}
          viewerRole={user.role}
          ownerName={owner}
        />

        {!isAdmin && (
          <details className="mt-[26.4px] border-t-2 border-rule pt-[13.2px]">
            <summary className="w-fit cursor-pointer py-[8px] text-[14px] font-bold text-ink-2">Request options</summary>
            <div className="mt-[13.2px]">
              {requestDetails}
              {withdrawal}
            </div>
          </details>
        )}
      </main>

      {sent && <Toast>Request sent · {owner} has been notified</Toast>}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
