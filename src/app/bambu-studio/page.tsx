import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { AppHeader } from "@/components/app-header";
import { Kicker } from "@/components/ui";

export default async function BambuStudioSetup() {
  const user = await requireUser("/bambu-studio");
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return <><AppHeader user={user} active={user.role === "admin" ? "/queue" : "/me"} />
    <main className="mx-auto max-w-[820px] px-[24px] pb-[80px] pt-[35px]">
      <Kicker>One-time setup · Windows</Kicker><h1 className="mb-[12px] mt-0 text-[42px] leading-[1] text-ink">Tickets → Bambu Studio</h1>
      <p className="text-[16px] leading-[1.6] text-ink-2">Install the helper on the computer where you use Bambu Studio. A ticket link downloads its private model and opens the local file in Studio, with the ticket number in the filename.</p>
      <ol className="space-y-[18px] pl-[24px] text-[15px] leading-[1.6] text-ink">
        <li>Install Bambu Studio, then <a href="/helpers/printit-bambu.ps1" download className="font-bold underline underline-offset-2">download the Windows helper</a>.</li>
        <li>Open PowerShell in the folder where you saved it, and run:<pre className="mt-[10px] overflow-x-auto rounded-card border-2 border-ink bg-porcelain p-[14px] text-[12px]"><code>{`powershell -NoProfile -ExecutionPolicy Bypass -File .\printit-bambu.ps1 -BaseUrl "${origin}"`}</code></pre>If Studio is installed elsewhere, add <code className="text-[12px]">-BambuPath "C:\path\to\bambu-studio.exe"</code>.</li>
        <li>Open a ticket and click <strong>Open in Bambu Studio</strong>. Allow the browser to open the helper. Check the printer profile, filament, copies and slice in Studio.</li>
      </ol>
      <p className="mt-[24px] rounded-panel border-2 border-ink bg-mint-wash p-[16px] text-[14px] leading-[1.6] text-ink">The helper uses a link valid for 30 minutes and for one model. If it expires, refresh the ticket. You can always use the ordinary Download button and import the file into Studio.</p>
      <h2 className="mt-[30px] text-[25px] text-ink">Connect the print history</h2>
      <p className="text-[14px] leading-[1.7] text-ink-2">The printer owner connects Bambu Lab under the printer cards on the queue. Save projects with their ticket number, such as PI-42. After sending the print from Studio, open the ticket and link the synced job. Add every plate or retry. When the print is checked and moved to Pickup, import the actual runtime from the successful jobs.</p>
      <p className="text-[13px] leading-[1.6] text-ink-2">The helper opens models; you send prints from Studio. The website refreshes history while a connected queue or ticket is visible. Filament weight estimates remain separate from recorded extrusion in meters.</p>
      <Link href={user.role === "admin" ? "/queue" : "/me"} className="mt-[18px] inline-block font-bold text-ink underline underline-offset-2">← Back to {user.role === "admin" ? "the queue" : "my orders"}</Link>
    </main></>;
}
