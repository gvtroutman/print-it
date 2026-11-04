import "server-only";
import { db } from "@/lib/db";
import { SCREEN_RETENTION_DAYS, screenDay, screenSince, type ScreenPage } from "@/lib/screen-sizes";

type ScreenView = {
  page: ScreenPage; width: number; height: number;
  device: string; browser: string; os: string;
};

// Cleanup runs at most hourly per worker; failed attempts can be retried.
let cleanedAt = 0;
export async function recordScreenView(view: ScreenView, now = new Date()) {
  if (now.getTime() - cleanedAt > 3_600_000) {
    await db.screenSizeDaily.deleteMany({ where: { day: { lt: screenSince(SCREEN_RETENTION_DAYS, now) } } });
    cleanedAt = now.getTime();
  }
  const dimensions = { day: screenDay(now), ...view };
  await db.screenSizeDaily.upsert({
    where: { dimensions },
    create: { ...dimensions, views: 1 },
    update: { views: { increment: 1 } },
  });
}

export async function screenSizeReport(days: number, page?: ScreenPage, size?: { width: number; height: number }) {
  const where = { day: { gte: screenSince(days) }, ...(page ? { page } : {}), ...size };
  const [total, sizes, devices, browsers, systems, pages] = await Promise.all([
    db.screenSizeDaily.aggregate({ where, _sum: { views: true } }),
    db.screenSizeDaily.groupBy({ by: ["width", "height"], where, _sum: { views: true },
      orderBy: [{ _sum: { views: "desc" } }, { width: "asc" }, { height: "asc" }], take: 20 }),
    db.screenSizeDaily.groupBy({ by: ["device"], where, _sum: { views: true }, orderBy: { _sum: { views: "desc" } } }),
    db.screenSizeDaily.groupBy({ by: ["browser"], where, _sum: { views: true }, orderBy: { _sum: { views: "desc" } } }),
    db.screenSizeDaily.groupBy({ by: ["os"], where, _sum: { views: true }, orderBy: { _sum: { views: "desc" } } }),
    db.screenSizeDaily.groupBy({ by: ["page"], where, _sum: { views: true }, orderBy: { _sum: { views: "desc" } } }),
  ]);
  return { total: total._sum.views ?? 0, sizes, devices, browsers, systems, pages };
}
