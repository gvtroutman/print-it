import { withActor } from "@/lib/api";
import { storyIdOr400 } from "@/lib/stories";
import { importBambuRuntime } from "@/lib/ticket-pipeline";
export const POST = withActor<{ id: string }>(async (_request, actor, { id }) =>
  Response.json(await importBambuRuntime(actor, storyIdOr400(id))), { admin: true });
