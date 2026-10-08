import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Home differs by role, exactly as the handoff specifies: the printer owner
 * starts at the queue, because their job is deciding; everyone else starts at
 * a new order, because that is what they come here to do.
 */
export default async function Index() {
  const user = await requireUser("/");
  redirect(user.role === "admin" ? "/queue" : "/upload");
}
