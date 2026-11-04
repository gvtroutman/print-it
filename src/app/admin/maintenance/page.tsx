import { requireAdmin } from "@/lib/authz";
import { maintenanceStatus } from "@/lib/maintenance";
import { AppHeader } from "@/components/app-header";
import { H1, Kicker, Lead } from "@/components/ui";
import { MaintenanceForm } from "./maintenance-form";

export const dynamic = "force-dynamic";

export default async function MaintenanceSettingsPage() {
  const admin = await requireAdmin();
  const status = await maintenanceStatus();
  return <>
    <AppHeader user={admin} active="/admin/maintenance" />
    <main className="mx-auto max-w-[760px] px-5 py-10">
      <Kicker>Admin · printer repairs</Kicker>
      <H1>Maintenance mode</H1>
      <Lead>Let members know when the printer needs a little care.</Lead>
      <p className="mb-6 font-bold" role="status">{status.enabled ? "Site closed to members · maintenance is on" : "Site open · maintenance is off"}</p>
      <MaintenanceForm {...status} />
    </main>
  </>;
}
