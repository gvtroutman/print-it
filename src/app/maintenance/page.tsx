import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/authz";
import { maintenanceStatus } from "@/lib/maintenance";
import { AuthShell, Button, H1, Kicker } from "@/components/ui";
import { MaintenanceWatch } from "@/components/maintenance-watch";
import { leaveMaintenancePreview } from "./actions";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [status, user] = await Promise.all([maintenanceStatus(), currentUser()]);
  if (!status.enabled) redirect("/");
  return <AuthShell closed shopSign>
    <MaintenanceWatch paused message={status.message} />
    <Kicker>Temporarily closed</Kicker>
    <H1>Printer repair break</H1>
    <p className="mb-6 whitespace-pre-wrap break-words text-lg leading-relaxed">{status.message}</p>
    <p className="mb-6 text-sm text-ink-2">Existing orders are saved. New requests are paused until maintenance is finished.</p>
    <div className="flex flex-wrap items-center gap-5">
      <a href="/maintenance" className="font-bold underline underline-offset-4">Check again</a>
      {user?.previewing ? <form action={leaveMaintenancePreview}><Button variant="ghost">Back to admin</Button></form>
        : <Link href={user?.role === "admin" ? "/admin/maintenance" : "/signin?next=%2Fadmin%2Fmaintenance"} className="text-sm underline underline-offset-4">Admin access</Link>}
    </div>
  </AuthShell>;
}
