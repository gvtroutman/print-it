import { withActor, jsonBody, fail } from "@/lib/api";
import { storyIdOr400 } from "@/lib/stories";
import { setPreparation } from "@/lib/ticket-pipeline";

export const POST = withActor<{ id: string }>(async (request, actor, { id }) => {
  const body = await jsonBody(request);
  if (typeof body.ready !== "boolean") return fail(400, "ready must be true or false.");
  return Response.json(await setPreparation(actor, storyIdOr400(id), body.ready, body.confirmed === true));
}, { admin: true });
