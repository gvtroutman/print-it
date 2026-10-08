"use server";

import { redirect } from "next/navigation";

import { endPreview, startPreview } from "@/lib/authz";

/**
 * The printer owner's member preview, on and off. How it works and why it is
 * safe is written up beside `currentUser` in `src/lib/authz.ts`.
 *
 * Each lands on the other side's home rather than staying put: an admin page
 * would 404 the moment the preview starts, and a new order is where members begin.
 */

export async function startPreviewAction(): Promise<void> {
  await startPreview();
  redirect("/upload");
}

export async function endPreviewAction(): Promise<void> {
  await endPreview();
  redirect("/queue");
}
