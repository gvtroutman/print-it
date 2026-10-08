import Link from "next/link";
import { notFound } from "next/navigation";

import { getStoryOr404, printerName, requireUser, storyRef, FLOW } from "@/lib/authz";
import { PRIORITY_CHIP, STORY_PRIORITIES, quantityText, relativeTime } from "@/lib/catalog";
import { changeStoryPriority } from "@/app/actions/stories";
import { formatBytes } from "@/lib/models";
import { trustedSourceLink } from "@/lib/import-source";
import { AppHeader } from "@/components/app-header";
import { Fact, Notice, StatusChip } from "@/components/ui";
import { AdminActions } from "@/components/admin-actions";
import { Conversation } from "@/components/conversation";
import { OrderMedia, type MediaItem } from "@/components/order-media";
import { displayLink } from "@/lib/links";
import { OpenInSlicer } from "@/components/open-in-slicer";
import { DownloadModel } from "@/components/download-model";
import { Toast } from "@/components/toast";
import { ColorSwatch } from "@/components/color-swatch";
import { WithdrawStory } from "@/components/withdraw-story";
import { RequeueStory } from "@/components/requeue-story";

export const dynamic = "force-dynamic";

/**
 * Story detail — the read half. Handoff §4.
 *
 * The 3D viewer, the conversation and the admin action panel are the next
 * slice. What is here is everything that does not need them: the file's
 * measured meta, the wish, and where the story sits in the flow.
 */
export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string; toast?: string; error?: string }>;
}) {
  const [{ id }, { sent, toast, error }] = await Promise.all([params, searchParams]);
  const storyId = Number(id);
  if (!Number.isInteger(storyId)) notFound();

  const user = await requireUser(`/story/${id}`);
  // 404s rather than 403s for a client asking after someone else's story —
  // a 403 would confirm it exists.
  const story = await getStoryOr404(storyId, user);
  const owner = await printerName();

  const currentIndex = (FLOW as readonly string[]).indexOf(story.status);
  // Null for an upload — and for anything in the column that is not a link
  // this app could have written, because it is about to become an href.
  const source = trustedSourceLink(story.sourceUrl);
  // Matches `changeStoryPriority` in src/lib/stories.ts: the requester or the
  // owner, and only while there is still something to order.
  const canReprioritise =
    (user.role === "admin" || story.uploader.id === user.id) &&
    story.status !== "Done" && story.status !== "Declined";

  // The main model first, then everything else in the order it was added. A
  // request filed as words alone has no main model.
  const model =
    story.filename && story.fileSize !== null
      ? { filename: story.filename, fileSize: story.fileSize }
      : null;
  const media: MediaItem[] = [
    ...(model
      ? [{
          key: "main",
          kind: "model" as const,
          filename: model.filename,
          fileSize: model.fileSize,
          dims: story.dims,
          src: `/api/models/${story.id}`,
          downloadHref: null,
        }]
      : []),
    ...story.attachments.map((a) => {
      const src = `/api/stories/${story.id}/attachments/${a.id}`;
      return {
        key: a.id,
        kind: a.kind,
        filename: a.filename,
        fileSize: a.fileSize,
        dims: a.dims,
        src,
        downloadHref: `${src}?download=1`,
      };
    }),
  ];
  // Re-checked here rather than trusted from the column: these become hrefs.
  const links = story.links.flatMap((l) => displayLink(l) ?? []);

  return (
    <>
      <AppHeader user={user} active="/board" />

      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <Link
          href="/board"
          className="inline-block font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink-2 underline underline-offset-4 hover:text-cherry-dk"
        >
          ← Back to the rail
        </Link>

        <div className="mt-[13.2px] grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-[26.4px]">
          {/* ---------- left: the file ---------- */}
          <div>
            {media.length > 0 ? (
              <OrderMedia colorHex={story.colorHex} items={media} />
            ) : (
              <div className="rounded-panel border-[3px] border-dashed border-ink-3 bg-porcelain px-[26.4px] py-[35.2px] text-center">
                <p className="m-0 font-display text-[19px] text-ink">No model yet</p>
                <p className="m-0 mt-[6px] font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
                  Asked for in words · sort out the file in the conversation below
                </p>
              </div>
            )}

            {/* Both measured from the file itself. Nothing inferred. */}
            {model && (
              <div className="mt-[13.2px] flex flex-wrap gap-[8px]">
                {[story.dims ?? "dimensions unknown", formatBytes(model.fileSize)].map((v) => (
                  <span
                    key={v}
                    className="rounded-chip border-2 border-ink bg-porcelain px-[11px] py-[3px] font-mono text-[12px] font-bold text-ink"
                  >
                    {v}
                  </span>
                ))}
              </div>
            )}

            {/* Where an imported model came from: the page with its author,
                its licence and its print notes, which the file alone does not
                carry. */}
            {source && (
              <p className="m-0 mt-[13.2px] font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">
                Imported from{" "}
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-bold text-ink-2 underline underline-offset-4 hover:text-cherry-dk"
                >
                  {source.label} ↗
                </a>
              </p>
            )}

            {/* Send the model to a PrusaSlicer on the viewer's own machine.
                The bytes are fetched by a local helper, not by the slicer —
                see the component and docs/prusaslicer.md for why. */}
            {/* The plain way to get the bytes — no helper, any machine. Kept
                above the slicer control so the simple answer is the visible
                one. */}
            {model && (
              <>
                <DownloadModel storyId={story.id} filename={model.filename} />
                <OpenInSlicer storyId={story.id} userId={user.id} />
              </>
            )}

            <Conversation
              storyId={story.id}
              comments={story.comments}
              viewerRole={user.role}
              ownerName={owner}
            />
          </div>

          {/* ---------- right: the wish and the flow ---------- */}
          <div>
            <div className="mb-[8.8px] flex flex-wrap items-center gap-[8.8px]">
              <span className="rounded-chip border-2 border-ink bg-porcelain px-[11px] py-[3px] font-mono text-[12px] font-bold tracking-[0.06em] text-ink">
                {storyRef(story.id)}
              </span>
              <StatusChip status={story.status} />
              {story.flagged && (
                <span className="rounded-chip border-2 border-ink bg-cherry px-[11px] py-[3px] font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink">
                  flagged{story.flagReason ? `: ${story.flagReason}` : ""}
                </span>
              )}
            </div>

            <h1 className="m-0 mb-[13.2px] text-[36px] leading-[1.02] text-ink">
              {story.title}
            </h1>
            {story.note && (
              <p className="m-0 mb-[22px] text-[16px] leading-[1.55] text-ink-2 text-pretty">
                {story.note}
              </p>
            )}

            {/* Links the requester sent along. Typed by a person, so they open
                in a new tab with no referrer and no window handle back. */}
            {links.length > 0 && (
              <div className="mb-[22px]">
                <div className="mb-[6px] font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  Links sent with it
                </div>
                <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
                  {links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="break-all font-mono text-[13.5px] font-bold text-ink-2 underline underline-offset-4 hover:text-cherry-dk"
                      >
                        {link.label} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-panel border-[3px] border-ink bg-porcelain p-[22px] shadow-stamp">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[17.6px]">
                <Fact label="Asked by">{story.uploader.name}</Fact>
                <Fact label="Quantity">{quantityText(story.quantity)}</Fact>
                <Fact label="Priority">{PRIORITY_CHIP[story.priority]?.label ?? story.priority}</Fact>
                <Fact label="Material">{story.material}</Fact>
                <Fact label="Color wish">
                  <span className="flex items-center gap-[8.8px]">
                    <ColorSwatch
                      mode={story.colorMode}
                      style={story.colorStyle ?? story.colorHex}
                      className="h-[18px] w-[18px] rounded-full border-2 border-ink"
                    />
                    {story.colorName}
                  </span>
                </Fact>
              </div>

              {/* Change the priority after filing — the requester's on their
                  own ticket, the owner's on any, while it is still on the
                  rail. A plain form, so it works with JavaScript off. The
                  service decides; this only decides whether to draw it. */}
              {canReprioritise && (
                <form
                  action={changeStoryPriority}
                  className="mt-[17.6px] flex flex-wrap items-end gap-[8.8px] border-t-2 border-dashed border-rule pt-[17.6px]"
                >
                  <input type="hidden" name="storyId" value={story.id} />
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
                      defaultValue={story.priority}
                      className="rounded-card border-[3px] border-ink bg-porcelain px-[13px] py-[8px] text-[15px] font-bold text-ink"
                    >
                      {STORY_PRIORITIES.map((p) => (
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

            {/* Optional slicer settings the requester noted (FRR-103). Shown so
                the specifics live on the ticket rather than in a chat thread.
                React escapes the body; a hostile value renders as text. */}
            {story.printSettings && (
              <div className="mt-[17.6px] rounded-panel border-[3px] border-ink bg-cream-2 p-[17.6px]">
                <div className="mb-[6px] font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  Print settings
                </div>
                <p className="m-0 whitespace-pre-wrap font-mono text-[14px] leading-[1.5] text-ink">
                  {story.printSettings}
                </p>
              </div>
            )}

            <section className="mt-[26.4px]">
              <h2 className="m-0 mb-[13.2px] font-display text-[22px] text-ink">
                Where it&rsquo;s at
              </h2>
              {story.status === "Declined" ? (
                <p className="m-0 rounded-card border-[3px] border-ink bg-cream-3 px-[17.6px] py-[13.2px] text-[15px] text-ink-2">
                  This one was declined {relativeTime(story.updatedAt)}.
                </p>
              ) : (
                <ol className="m-0 flex list-none flex-col p-0">
                  {FLOW.map((step, i) => {
                    const done = currentIndex >= 0 && i < currentIndex;
                    const now = i === currentIndex;
                    return (
                      <li key={step} className="flex items-start gap-[13.2px]">
                        <div className="flex flex-none flex-col items-center">
                          <span
                            aria-hidden
                            className={`h-[20px] w-[20px] rounded-full border-[3px] border-ink ${
                              done ? "bg-mint" : now ? "bg-sun" : "bg-cream-3"
                            }`}
                          />
                          {i < FLOW.length - 1 && (
                            <span
                              aria-hidden
                              className={`w-[4px] flex-1 ${done ? "bg-mint" : "bg-cream-3"}`}
                              style={{ minHeight: "26px" }}
                            />
                          )}
                        </div>
                        <div className="pb-[17.6px]">
                          <div
                            className={`font-display text-[17px] ${
                              done || now ? "text-ink" : "text-ink-3"
                            }`}
                          >
                            {step}
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

            {/*
              The printer owner's controls. Rendered only for the admin, and
              the actions behind them check the role again — drawing a button
              is not authorisation.
            */}
            {/*
              The requester's own control. Deliberately not gated on role —
              an admin looking at somebody else's ticket is not its owner, and
              the action refuses on ownership rather than on role.
            */}
            {story.uploader.id === user.id &&
              (story.status === "Requested" ||
                story.status === "Accepted" ||
                story.status === "Declined") && (
                <WithdrawStory
                  storyId={story.id}
                  label={storyRef(story.id)}
                  from={`/story/${story.id}`}
                />
              )}

            {/*
              Print again — the requester's, on any of their own tickets. Like
              withdraw, gated on ownership rather than role; the action re-checks.
            */}
            {story.uploader.id === user.id && (
              <RequeueStory
                storyId={story.id}
                label={storyRef(story.id)}
              />
            )}

            {user.role === "admin" && (
              <section className="mt-[26.4px] rounded-panel border-[3px] border-ink bg-aqua-wash p-[22px] shadow-stamp">
                <h2 className="m-0 mb-[13.2px] font-display text-[20px] text-ink">
                  {story.status === "Requested" ? "This one needs a yes" : "Move it along"}
                </h2>
                {error && (
                  <div className="mb-[13.2px]">
                    <Notice tone="warn">{error}</Notice>
                  </div>
                )}
                <AdminActions
                  storyId={story.id}
                  status={story.status}
                  flagged={story.flagged}
                  flagReason={story.flagReason}
                  from={`/story/${story.id}`}
                />
              </section>
            )}
          </div>
        </div>
      </main>

      {sent && <Toast>Order in · {owner} has been notified</Toast>}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
