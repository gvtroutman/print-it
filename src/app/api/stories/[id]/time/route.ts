import { jsonBody, ok, storyResource, withActor } from "@/lib/api";
import { getStory, recordStoryPrintTime, StoryProblem, storyIdOr400 } from "@/lib/stories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only actual runtime, including corrections on historical completed prints. */
export const PATCH = withActor<{ id: string }>(async (request, actor, { id }) => {
  const storyId = storyIdOr400(id);
  const body = await jsonBody(request);
  if (!Object.hasOwn(body, "printHours")) throw new StoryProblem(400, "Supply printHours, or null for unknown runtime.");
  await recordStoryPrintTime(actor, storyId, body.printHours);
  return ok({ story: storyResource(await getStory(actor, storyId)) });
}, { admin: true });
