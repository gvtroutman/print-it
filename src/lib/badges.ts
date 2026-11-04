import "server-only";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { MEMBER_BADGES, SPOOL_EQUIVALENT_METERS, meetsBadgeGoal } from "@/lib/badge-catalog";
import { isFiberMaterial, isRainbowFilament, isScentedMaterial, requestedFilamentFamily } from "@/lib/filament-traits";
import { AUTO_MATERIAL } from "@/lib/catalog";

/**
 * All submission paths save the lifetime count, request, stickers and
 * announcements together. Updating the member first serializes their
 * simultaneous submissions, so no milestone or new material is missed.
 * Unique member/key pairs keep awards and announcements one-time. A failed
 * request increments nothing, and withdrawals never reduce the lifetime count.
 */
export async function createStoryWithBadges(data: Prisma.StoryUncheckedCreateInput) {
  return db.$transaction(async (tx) => {
    const member = await tx.user.update({
      where: { id: data.uploaderId },
      data: { printSubmissionCount: { increment: 1 } },
      select: { createdAt: true, printSubmissionCount: true, fiberSubmissionCount: true, requestedMaterialIds: true, stickersEnabled: true },
    });
    const story = await tx.story.create({ data });
    const [selected, availableMaterials] = await Promise.all([
      tx.catalogMaterial.findUnique({ where: { name: story.material }, select: { id: true } }),
      tx.catalogMaterial.findMany({
        where: { active: true, name: { not: AUTO_MATERIAL }, colors: { some: { active: true } } },
        select: { id: true, name: true },
      }),
    ]);
    const fiber = isFiberMaterial(story.material);
    const newMaterial = story.material !== AUTO_MATERIAL && selected !== null && !member.requestedMaterialIds.includes(selected.id);
    if (fiber || newMaterial) {
      await tx.user.update({
        where: { id: story.uploaderId },
        data: {
          ...(fiber ? { fiberSubmissionCount: { increment: 1 } } : {}),
          ...(newMaterial ? { requestedMaterialIds: { push: selected.id } } : {}),
        },
      });
    }
    const progress = {
      submittedAt: story.createdAt,
      joinedAt: member.createdAt,
      submissions: member.printSubmissionCount,
      fiberSubmissions: member.fiberSubmissionCount + Number(fiber),
      requestedMaterialIds: newMaterial ? [...member.requestedMaterialIds, selected.id] : member.requestedMaterialIds,
      availableMaterials,
      requestedFilamentFamily: requestedFilamentFamily(story.material, story.swatchType),
      requestedRainbowFilament: story.material !== AUTO_MATERIAL &&
        [story.material, story.swatchType, story.colorName].some((label) => label != null && isRainbowFilament(label)),
      requestedScentedFilament: story.material !== AUTO_MATERIAL &&
        [story.material, story.swatchType, story.colorName].some((label) => label != null && isScentedMaterial(label)),
    };
    for (const badge of MEMBER_BADGES) {
      if (!meetsBadgeGoal(badge, progress)) continue;
      const awarded = await tx.memberBadge.createMany({
        data: {
          userId: story.uploaderId,
          badgeKey: badge.key,
          earnedAt: story.createdAt,
          storyId: story.id,
        },
        skipDuplicates: true,
      });
      if (awarded.count > 0 && member.stickersEnabled) {
        await tx.notification.create({
          data: {
            recipientId: story.uploaderId,
            badgeKey: badge.key,
            text: badge.announcement,
          },
        });
      }
    }
    return story;
  });
}

/** Called under the member's row lock, after a completion or usage correction.
 * Delivery is off the plate; Done is collected. Both describe a completed
 * print, and summing the requests counts each once across that last transition.
 */
export async function awardCompletedPrintBadges(tx: Prisma.TransactionClient, userId: string, storyId: number) {
  const completed = await tx.story.findFirst({
    where: { id: storyId, uploaderId: userId, status: { in: ["Delivery", "Done"] } },
    select: { id: true },
  });
  if (!completed) return;
  const member = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { stickersEnabled: true } });
  const usage = await tx.story.aggregate({
    where: { uploaderId: userId, status: { in: ["Delivery", "Done"] } },
    _sum: { filamentMeters: true },
    _count: { _all: true },
  });
  for (const badge of MEMBER_BADGES) {
    if (badge.goal.kind === "completed") {
      if (usage._count._all < badge.goal.target) continue;
    } else if (badge.goal.kind === "extrusion" || badge.goal.kind === "spools") {
      const targetMeters = badge.goal.target * (badge.goal.kind === "spools" ? SPOOL_EQUIVALENT_METERS : 1);
      if (!usage._sum.filamentMeters?.gte(targetMeters)) continue;
    } else {
      continue;
    }
    const awarded = await tx.memberBadge.createMany({
      data: { userId, badgeKey: badge.key, storyId },
      skipDuplicates: true,
    });
    if (awarded.count > 0 && member.stickersEnabled) {
      await tx.notification.create({ data: { recipientId: userId, badgeKey: badge.key, text: badge.announcement } });
    }
  }
}
