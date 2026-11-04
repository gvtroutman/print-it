import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { record } from "@/lib/audit";
import { StoryProblem } from "@/lib/stories";
import { storyRef, type Actor } from "@/lib/scope";
import { completedJobHours, preparationBlockers } from "@/lib/print-pipeline";
import { inspectModel, safeFilename, extensionOf, REJECTION_COPY } from "@/lib/models";
import { putModel, deleteModel, storageKeyFor, MIME_FOR } from "@/lib/storage";

function requireOwner(actor: Actor) {
  if (actor.role !== "admin") throw new StoryProblem(403, "Only the printer owner manages preparation and Bambu jobs.");
}
function refresh(id: number) {
  revalidatePath("/queue");
  revalidatePath(`/story/${id}`);
}

/** Add a model to a words-only request, or replace it before printing. */
export async function attachTicketModel(actor: Actor, id: number, name: string, bytes: Uint8Array) {
  requireOwner(actor);
  const story = await db.story.findUnique({ where: { id } });
  if (!story) throw new StoryProblem(404, "That ticket no longer exists.");
  if (story.status !== "Requested" && story.status !== "Accepted") throw new StoryProblem(409, "Models can only change before printing.");
  const filename = safeFilename(name);
  const inspected = inspectModel(filename, bytes);
  if (!inspected.ok) throw new StoryProblem(422, REJECTION_COPY[inspected.reason]);
  const extension = extensionOf(filename);
  const key = storageKeyFor(extension);
  try {
    await putModel(key, bytes);
    const changed = await db.story.updateMany({
      where: { id, status: story.status, storageKey: story.storageKey },
      data: { filename, fileSize: bytes.length, mimeType: MIME_FOR[extension] ?? "application/octet-stream", storageKey: key, dims: inspected.dims, preparedAt: null, sourceUrl: null },
    });
    if (!changed.count) throw new StoryProblem(409, "This ticket changed. Refresh and try again.");
  } catch (error) {
    await deleteModel(key).catch(() => {});
    throw error;
  }
  if (story.storageKey) await deleteModel(story.storageKey).catch(error => console.error("[pipeline] old model cleanup failed", error));
  await record({ action: "story.model_updated", actor, subject: storyRef(id), detail: { filename, bytes: bytes.length } });
  refresh(id);
  revalidatePath("/me");
}

export async function setPreparation(actor: Actor, id: number, ready: boolean, confirmed = false) {
  requireOwner(actor);
  if (ready && !confirmed) throw new StoryProblem(400, "Confirm the model, filament and slice checks first.");
  const story = await db.story.findUnique({ where: { id } });
  if (!story) throw new StoryProblem(404, "That ticket no longer exists.");
  if (story.status !== "Accepted") throw new StoryProblem(409, "Preparation can only change on an accepted ticket.");
  const blockers = preparationBlockers(story);
  if (ready && (blockers.length || !story.storageKey)) throw new StoryProblem(409, blockers[0] ?? "Model needed");
  const preparedAt = ready ? new Date() : null;
  const changed = await db.story.updateMany({
    where: { id, status: "Accepted", preparedAt: story.preparedAt, ...(ready ? { flagged: false, storageKey: story.storageKey } : {}) },
    data: { preparedAt },
  });
  if (!changed.count) throw new StoryProblem(409, "This ticket changed. Refresh and check it again.");
  await record({ action: ready ? "story.prepared" : "story.preparation_reset", actor, subject: storyRef(id) });
  refresh(id);
  return { preparedAt };
}

/** Each cloud task belongs to one ticket; a ticket can have multiple plates or retries. */
export async function assignBambuJob(actor: Actor, id: number, rawJobId: unknown, link: boolean) {
  requireOwner(actor);
  if (typeof rawJobId !== "string" || !rawJobId.trim() || rawJobId.length > 200) throw new StoryProblem(400, "Choose a Bambu job.");
  const jobId = rawJobId.trim();
  await db.$transaction(async tx => {
    // Serialize linking against withdrawals/status changes, then against assignment to another ticket.
    await tx.$queryRaw`SELECT "id" FROM "story" WHERE "id" = ${id} FOR UPDATE`;
    const story = await tx.story.findUnique({ where: { id } });
    if (!story) throw new StoryProblem(404, "That ticket no longer exists.");
    if (story.status === "Requested" || story.status === "Declined") throw new StoryProblem(409, "Accept this ticket before linking a print job.");
    await tx.$queryRaw`SELECT "id" FROM "printerPrint" WHERE "id" = ${jobId} FOR UPDATE`;
    const job = await tx.printerPrint.findUnique({ where: { id: jobId } });
    if (!job) throw new StoryProblem(404, "Sync Bambu history first; that job is not available.");
    if (link && job.storyId !== null && job.storyId !== id) throw new StoryProblem(409, "That job already belongs to another ticket. Unlink it there first.");
    if (!link && job.storyId !== id) throw new StoryProblem(409, "That job is not linked to this ticket.");
    await tx.printerPrint.update({ where: { id: jobId }, data: { storyId: link ? id : null } });
  });
  await record({ action: link ? "story.bambu_job_linked" : "story.bambu_job_unlinked", actor, subject: storyRef(id), detail: { jobId } });
  refresh(id);
}

/** Explicit import keeps subsequent cloud syncs from silently rewriting actual order usage. */
export async function importBambuRuntime(actor: Actor, id: number) {
  requireOwner(actor);
  const initial = await db.story.findUnique({ where: { id } });
  if (!initial) throw new StoryProblem(404, "That ticket no longer exists.");
  const { hours, jobIds } = await db.$transaction(async tx => {
    // Same lock order as other usage writes; assignment changes also lock this ticket.
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${initial.uploaderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "story" WHERE "id" = ${id} FOR UPDATE`;
    const story = await tx.story.findUnique({ where: { id } });
    if (!story) throw new StoryProblem(404, "That ticket no longer exists.");
    if (story.status !== "Delivery" && story.status !== "Done") throw new StoryProblem(409, "Check the print and move it to Pickup before importing runtime.");
    await tx.$queryRaw`SELECT "id" FROM "printerPrint" WHERE "storyId" = ${id} FOR SHARE`;
    const jobs = await tx.printerPrint.findMany({ where: { storyId: id } });
    const hours = completedJobHours(jobs);
    if (hours === null) throw new StoryProblem(409, "Link finished jobs with known runtime first. Active or unknown jobs cannot be imported.");
    await tx.story.update({ where: { id }, data: { printHours: hours } });
    return { hours, jobIds: jobs.filter(j => j.outcome === "finished").map(j => j.id) };
  });
  await record({ action: "story.bambu_runtime_imported", actor, subject: storyRef(id), detail: { hours, jobIds } });
  revalidatePath("/me");
  revalidatePath("/member");
  refresh(id);
  return { hours };
}
