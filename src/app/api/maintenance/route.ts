import { maintenanceStatus } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/** The same public notice shown on sign-in; never includes account data. */
export async function GET() {
  return Response.json(await maintenanceStatus(), { headers: { "Cache-Control": "no-store" } });
}
