import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function StickerGalleryPage() {
  await requireUser("/stickers");
  redirect("/member#badges");
}
