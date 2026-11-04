import { withActor, jsonBody } from "@/lib/api";
import { storyIdOr400 } from "@/lib/stories";
import { assignBambuJob } from "@/lib/ticket-pipeline";
import { db } from "@/lib/db";
import { getStory } from "@/lib/stories";

export const GET = withActor<{ id: string }>(async (_request, actor, { id }) => {
  const storyId = storyIdOr400(id);
  await getStory(actor, storyId);
  const jobs = await db.printerPrint.findMany({ where: { storyId }, orderBy: { startedAt: "desc" }, select: { id: true, title: true, outcome: true, seconds: true, estimate: true, startedAt: true, endedAt: true, syncedAt: true, printer: { select: { name: true } } } });
  return Response.json({ jobs });
}, { admin: true });

export const POST = withActor<{ id: string }>(async (request, actor, { id }) => {
  const body = await jsonBody(request);
  await assignBambuJob(actor, storyIdOr400(id), body.jobId, true);
  return Response.json({ linked: true });
}, { admin: true });
export const DELETE = withActor<{ id: string }>(async (request, actor, { id }) => {
  const body = await jsonBody(request);
  await assignBambuJob(actor, storyIdOr400(id), body.jobId, false);
  return Response.json({ linked: false });
}, { admin: true });
