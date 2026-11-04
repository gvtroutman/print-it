import type { FeatureStatus } from "@prisma/client";

/** Plain-language updates for members; the owner's workflow keeps its labels. */
export const MEMBER_FEATURE_STATUS: Record<FeatureStatus, { label: string; note: string }> = {
  Requested: { label: "Sent", note: "Your request is waiting for a review." },
  Accepted: { label: "Planned", note: "Your request has been accepted and is on the list." },
  InProgress: { label: "In progress", note: "Work has started on your request." },
  Shipped: { label: "Available", note: "This change is ready for you to try in Print It!." },
  Done: { label: "Completed", note: "This request is complete. You can still leave a reply below." },
  Declined: { label: "Declined", note: "This request was declined. You can ask about it below." },
};
