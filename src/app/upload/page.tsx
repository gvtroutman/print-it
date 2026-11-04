import { printerName, requireUser } from "@/lib/authz";
import { AppHeader } from "@/components/app-header";
import { Notice } from "@/components/ui";
import { StarFlare } from "@/components/star-flare";
import { availableCatalog } from "@/lib/catalog-data";
import { enabledSources } from "@/lib/import-source";
import { warmLibrary } from "@/lib/filament-library";
import { listPalette } from "@/lib/palette";
import { filamentSettings } from "@/lib/filament-settings";
import { hasStoreAccess } from "@/lib/store-access";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await requireUser("/upload");
  const [owner, catalog, savedColors, filamentConfig, storeAccess] = await Promise.all([printerName(), availableCatalog(), listPalette(user), filamentSettings(), hasStoreAccess(user)]);
  // So the "can get" picker finds the library ready by the time it is opened.
  if (storeAccess) warmLibrary();

  return (
    <>
      <AppHeader user={user} active="/upload" sticky={false} />
      <main className="mx-auto w-full max-w-[900px] px-[16px] pb-[64px] pt-[30px] sm:px-[26.4px] sm:pb-[80px] sm:pt-[40px]">
        <div className="mb-[26.4px] text-center sm:mb-[35.2px]">
          <div className="flex items-center justify-center gap-[10px] sm:gap-[16px]">
            <StarFlare size={20} className="-rotate-12 sm:w-[26px]" />
            <h1 className="m-0 text-[34px] leading-[1.1] text-ink sm:text-[46px]">
              New Order
            </h1>
            <StarFlare size={30} className="rotate-12 sm:w-[36px]" />
          </div>
          <p className="m-0 mt-[12px] text-[14px] leading-[1.5] text-ink-2 sm:text-[15px]">
            Start with a model, a link, or an idea.
          </p>
        </div>
        {catalog.length > 0 ? (
          <UploadForm
            owner={owner}
            catalog={catalog}
            savedColors={savedColors}
            filamentConfig={filamentConfig}
            storeAccess={storeAccess}
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
