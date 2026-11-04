import type { StoryStatus } from "@prisma/client";

export const PIPELINE = [
  { key: "review", label: "Review", hint: "Decide what to make", color: "bg-sun-wash" },
  { key: "prepare", label: "Prepare", hint: "Check the model and slice", color: "bg-porcelain" },
  { key: "ready", label: "Ready", hint: "Prepared for the printer", color: "bg-mint-wash" },
  { key: "printing", label: "Printing", hint: "Follow the job in Bambu", color: "bg-aqua-wash" },
  { key: "pickup", label: "Pickup", hint: "Checked and ready to collect", color: "bg-cherry-wash" },
] as const;
export type PipelineStage = (typeof PIPELINE)[number]["key"];
type Preparation = { flagged: boolean; filename: string | null; preparedAt: Date | null };

export function preparationBlockers(story: Pick<Preparation, "flagged" | "filename">): string[] {
  return [
    ...(!story.filename ? ["Model needed"] : []),
    ...(story.flagged ? ["Resolve the model flag"] : []),
  ];
}

export function pipelineStage(story: Preparation & { status: StoryStatus }): PipelineStage | null {
  switch (story.status) {
    case "Requested": return "review";
    case "Accepted": return story.preparedAt && !preparationBlockers(story).length ? "ready" : "prepare";
    case "Printing": return "printing";
    case "Delivery": return "pickup";
    default: return null;
  }
}

type Job = { outcome: string; seconds: number; endedAt: Date | null };
export const isActiveJob = (outcome: string) => ["printing", "status 1", "status 4"].includes(outcome);

/** Runtime of successful jobs only. Estimates/failed attempts never become completed-order usage. */
export function completedJobHours(jobs: readonly Job[]): number | null {
  const completed = jobs.filter(j => j.outcome === "finished" && j.endedAt && j.seconds > 0);
  if (!completed.length || jobs.some(j => j.outcome !== "failed" && (j.outcome !== "finished" || !j.endedAt || j.seconds <= 0))) return null;
  return Math.round(completed.reduce((sum, j) => sum + j.seconds, 0) / 3.6) / 1000;
}

/** A filename hint, never an automatic assignment. PI-12 must not match PI-123. */
export function jobMentionsTicket(title: string, id: number): boolean {
  return new RegExp(`(?:^|[^a-z0-9])PI-${id}(?=$|[^a-z0-9])`, "i").test(title);
}

export function bambuStudioLink(storyId: number, token: string): string {
  return `printit-bambu://slice/${storyId}?t=${encodeURIComponent(token)}`;
}

export const studioSupportsModel = (filename: string) => /\.(stl|3mf|obj|amf|step|stp)$/i.test(filename);
