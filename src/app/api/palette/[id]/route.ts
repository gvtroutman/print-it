import { ok, withActor } from "@/lib/api";
import { removePaletteColor } from "@/lib/palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withActor<{ id: string }>(async (_request, actor, params) =>
  ok({ removed: await removePaletteColor(actor, params.id) }),
);
