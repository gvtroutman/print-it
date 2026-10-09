import { printerName, requireUser } from "@/lib/authz";
import { AppHeader } from "@/components/app-header";
import { Notice } from "@/components/ui";
import { availableCatalog } from "@/lib/catalog-data";
import { enabledSources } from "@/lib/import-source";
import { warmLibrary } from "@/lib/filament-library";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await requireUser("/upload");
  const [owner, catalog] = await Promise.all([printerName(), availableCatalog()]);
  // So the "can get" picker finds the library ready by the time it is opened.
  warmLibrary();

  return (
    <>
      <AppHeader user={user} active="/upload" />
      <main className="mx-auto w-full max-w-[1180px] px-[26.4px] pb-[80px] pt-[35.2px]">
        <div className="max-w-[780px]">
          {/* Still a sentence someone would say out loud, which was the point
              of the original H1 and survives every rename since. */}
          <h1 className="m-0 mb-[26.4px] text-center text-[46px] leading-[0.98] text-ink">
            Print It!
          </h1>
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
