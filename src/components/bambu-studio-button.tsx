import Link from "next/link";
import { mintSlicerToken } from "@/lib/slicer-token";
import { bambuStudioLink, studioSupportsModel } from "@/lib/print-pipeline";

export function BambuStudioButton({ storyId, userId, filename, compact = false }: { storyId: number; userId: string; filename: string; compact?: boolean }) {
  if (!studioSupportsModel(filename)) return <p className="m-0 text-[12px] text-ink-2">Export this model as STL or 3MF to prepare it in Bambu Studio.</p>;
  return <div className="flex flex-wrap items-center gap-[8px]">
    <a href={bambuStudioLink(storyId, mintSlicerToken(userId, storyId))} className={`stamp inline-flex items-center gap-[7px] rounded-chip border-[3px] border-ink bg-mint font-bold text-ink hover:bg-mint-wash ${compact ? "px-[10px] py-[6px] text-[12px]" : "px-[15px] py-[8px] text-[14px]"}`}>
      <span aria-hidden>↗</span> Open in Bambu Studio
    </a>
    <Link href="/bambu-studio" className="text-[12px] font-bold text-ink-2 underline underline-offset-2">Helper setup</Link>
  </div>;
}
