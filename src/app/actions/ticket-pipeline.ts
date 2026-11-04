"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { StoryProblem, storyIdOr400 } from "@/lib/stories";
import { assignBambuJob, importBambuRuntime, setPreparation } from "@/lib/ticket-pipeline";

async function run(form: FormData, operation: (id: number) => Promise<string>) {
  const from = safeRedirectPath(form.get("from"), "/queue");
  let kind = "toast", message: string;
  try { message = await operation(storyIdOr400(form.get("id"))); }
  catch (error) {
    if (!(error instanceof StoryProblem)) throw error;
    kind = "error"; message = error.message;
  }
  redirect(`${from}?${kind}=${encodeURIComponent(message)}`);
}
export async function prepareTicket(form: FormData) {
  const actor = await requireAdmin();
  await run(form, async id => {
    const ready = form.get("ready") === "true";
    const confirmed = ["modelChecked", "materialChecked", "sliceChecked"].every(key => form.get(key) === "on");
    await setPreparation(actor, id, ready, confirmed);
    return ready ? "Preparation confirmed. This ticket is ready to print." : "Ticket returned to preparation.";
  });
}
export async function linkBambuJob(form: FormData) {
  const actor = await requireAdmin();
  await run(form, async id => {
    const link = form.get("link") === "true";
    await assignBambuJob(actor, id, form.get("jobId"), link);
    return link ? "Bambu job linked to this ticket." : "Bambu job unlinked.";
  });
}
export async function importTicketRuntime(form: FormData) {
  const actor = await requireAdmin();
  await run(form, async id => `Imported ${(await importBambuRuntime(actor, id)).hours} hours from completed Bambu jobs.`);
}
