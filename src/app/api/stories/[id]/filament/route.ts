import { jsonBody, ok, storyResource, withActor } from "@/lib/api";
import { getStory, recordStoryFilament, StoryProblem, storyIdOr400 } from "@/lib/stories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only actual usage, including corrections on historical completed prints. */
export const PATCH = withActor<{ id: string }>(async (request, actor, { id }) => {
  const storyId = storyIdOr400(id);
  const body = await jsonBody(request);
  if (!Object.hasOwn(body, "filamentMeters")) throw new StoryProblem(400, "Supply filamentMeters, or null for unknown usage.");
  await recordStoryFilament(actor, storyId, body.filamentMeters);
  return ok({ story: storyResource(await getStory(actor, storyId)) });
}, { admin: true });
