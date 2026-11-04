import { withActor, fail } from "@/lib/api";
import { storyIdOr400 } from "@/lib/stories";
import { attachTicketModel } from "@/lib/ticket-pipeline";
import { MAX_BYTES } from "@/lib/models";
import { MAX_REQUEST_BYTES } from "@/lib/upload-limits";
import { acquireSlot, releaseSlot, BUSY_COPY } from "@/lib/upload-slots";

export const runtime = "nodejs";
export const POST = withActor<{ id: string }>(async (request, actor, { id }) => {
  const storyId = storyIdOr400(id);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return fail(413, "That model is too large.");
  if (!(await acquireSlot())) return fail(503, BUSY_COPY);
  try {
    let form: FormData;
    try { form = await request.formData(); } catch { return fail(400, "The upload did not arrive intact."); }
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return fail(400, "Choose a model file.");
    if (file.size > MAX_BYTES) return fail(413, "That model is too large.");
    await attachTicketModel(actor, storyId, file.name, new Uint8Array(await file.arrayBuffer()));
    return Response.json({ saved: true });
  } finally { releaseSlot(); }
}, { admin: true });
