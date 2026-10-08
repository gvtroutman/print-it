import { printerName, requireUser } from "@/lib/authz";
import { AppHeader } from "@/components/app-header";
import { Kicker } from "@/components/ui";
import { Notice } from "@/components/ui";
import { availableCatalog } from "@/lib/catalog-data";
import { enabledSources } from "@/lib/import-source";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await requireUser("/upload");
  const [owner, catalog] = await Promise.all([printerName(), availableCatalog()]);

  return (
    <>
      <AppHeader user={user} active="/upload" />
      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <div className="max-w-[780px]">
          <Kicker>New order</Kicker>
          {/* Still a sentence someone would say out loud, which was the point
              of the original H1 and survives every rename since. */}
          <h1 className="m-0 mb-[13.2px] text-[46px] leading-[0.98] text-ink">
            Print It!
          </h1>
          <p className="m-0 mb-[26.4px] text-[16.5px] leading-[1.5] text-ink-2 text-pretty">
            Say what you need — a few words is enough. Add a 3D model (
            <span className="font-mono">.stl</span>,{" "}
            <span className="font-mono">.3mf</span>,{" "}
            <span className="font-mono">.obj</span>,{" "}
            <span className="font-mono">.step</span> and more), photos, videos or
            links if you have them. {owner} gets a ping, and you can follow
            your order under My orders.
          </p>
        </div>
        {catalog.length > 0 ? (
          <UploadForm
            owner={owner}
            catalog={catalog}
            importSources={enabledSources()}
          />
        ) : (
          <div className="max-w-[780px]">
            <Notice tone="warn">
              The printer owner has not listed any available material and color combinations yet.
            </Notice>
          </div>
        )}
      </main>
    </>
  );
}
