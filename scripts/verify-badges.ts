import "./_env";
/** Development database check of sticker thresholds, concurrency and lifetime progress. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { awardCompletedPrintBadges, createStoryWithBadges } from "../src/lib/badges";
import { FIRST_REQUEST_BADGE, THREE_PRINTS_BADGE, FIVE_PRINTS_BADGE, EIGHT_PRINTS_BADGE, TEN_PRINTS_BADGE, MAKING_TRACKS_BADGE, PEAK_PERFORMANCE_BADGE, MOUNT_EVEREST_METERS, ROY_G_BIV_BADGE, DAILY_FIBER_BADGE, FIRST_PRINT_BADGE, TWO_SPOOLS_BADGE, FIVE_SPOOLS_BADGE, SPOOL_EQUIVALENT_METERS, FLYING_SPAGHETTI_MONSTER_BADGE, HUNDRED_PRINTS_BADGE, LOVE_OF_MY_LIFE_BADGE, MATERIAL_EXPLORER_BADGE, MEMBER_BADGES, STOP_AND_SMELL_BADGE, meetsBadgeGoal } from "../src/lib/badge-catalog";
import { filamentFamily, requestedFilamentFamily, isFiberMaterial, isRainbowFilament, isScentedMaterial } from "../src/lib/filament-traits";
import { recordedSwatchChoice } from "../src/lib/filament-settings-data";

// Temporary members and catalog fixtures are cleaned up. Existing data is not cleared.
const memberIds: string[] = [];
const materialIds: string[] = [];
try {
  const member = await db.user.create({
    data: { name: "Sticker verification", email: `stickers-${randomUUID()}@example.test` },
  });
  memberIds.push(member.id);
  const other = await db.user.create({
    data: { name: "Other sticker verification", email: `stickers-${randomUUID()}@example.test` },
  });
  memberIds.push(other.id);
  const gift = MEMBER_BADGES.find((badge) => badge.key === LOVE_OF_MY_LIFE_BADGE)!;
  assert.equal(meetsBadgeGoal(gift, { submissions: 1000, fiberSubmissions: 1000, requestedMaterialIds: ["all"], availableMaterials: [{ id: "all", name: "PLA" }] }), false,
    "personal gifts cannot be earned through print or material progress");
  const wish = { createdAt: new Date("2026-04-15T12:00:00Z"), uploaderId: member.id, title: "Sticker test", colorName: "Slate", colorHex: "#4a5d78" };
  const count = async () => (await db.user.findUniqueOrThrow({ where: { id: member.id } })).printSubmissionCount;
  const hundred = () => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: member.id, badgeKey: HUNDRED_PRINTS_BADGE } } });
  const firstBadge = (userId: string) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: FIRST_PRINT_BADGE } } });
  async function checkCompletion(userId: string, storyId: number) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
      await awardCompletedPrintBadges(tx, userId, storyId);
    });
  }
  const completionBadge = MEMBER_BADGES.find((badge) => badge.key === FIRST_PRINT_BADGE)!;
  const muted = await db.user.create({ data: { name: "Stickers off", email: `muted-${randomUUID()}@example.test`, stickersEnabled: false, cardFlair: FIRST_PRINT_BADGE } });
  memberIds.push(muted.id);
  const mutedStory = await createStoryWithBadges({ ...wish, uploaderId: muted.id });
  assert.ok(await db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: muted.id, badgeKey: FIRST_REQUEST_BADGE } } }), "Disabled stickers still record submission progress");
  await db.story.update({ where: { id: mutedStory.id }, data: { status: "Delivery", filamentMeters: 50 } });
  await checkCompletion(muted.id, mutedStory.id);
  assert.ok(await firstBadge(muted.id), "Disabled stickers still record completed-print awards");
  assert.equal(await db.notification.count({ where: { recipientId: muted.id } }), 0, "Neither award path announces while stickers are off");
  await db.user.update({ where: { id: muted.id }, data: { stickersEnabled: true } });
  await checkCompletion(muted.id, mutedStory.id);
  assert.equal(await db.notification.count({ where: { recipientId: muted.id } }), 0, "Re-enabling never replays past awards");
  await createStoryWithBadges({ ...wish, uploaderId: muted.id, material: "PLA", colorName: "Rainbow" });
  assert.equal(await db.notification.count({ where: { recipientId: muted.id, badgeKey: ROY_G_BIV_BADGE } }), 1, "New awards announce normally after re-enabling");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: muted.id } })).cardFlair, FIRST_PRINT_BADGE);
  const progress = { submissions: 1000, fiberSubmissions: 0, requestedMaterialIds: [], availableMaterials: [] };
  assert.equal(meetsBadgeGoal(completionBadge, progress), false, "submissions cannot unlock the first completed print");
  assert.equal(meetsBadgeGoal(completionBadge, { ...progress, completedPrints: 1 }), true);

  // Everyday milestones use ordinary requests and completed prints, with no special filament.
  const easyKeys = [FIRST_REQUEST_BADGE, THREE_PRINTS_BADGE, FIVE_PRINTS_BADGE, EIGHT_PRINTS_BADGE, TEN_PRINTS_BADGE, MAKING_TRACKS_BADGE];
  for (const key of easyKeys) {
    const entry = MEMBER_BADGES.find(b => b.key === key)!;
    const empty = { ...progress, submissions: 0 };
    assert.equal(meetsBadgeGoal(entry, empty), false, key + " starts locked");
    const field = entry.goal.kind === "prints" ? "submissions" : entry.goal.kind === "completed" ? "completedPrints" : "completedFilamentMeters";
    if (!("target" in entry.goal)) throw new Error("Everyday badge needs a target");
    const target = entry.goal.target;
    assert.equal(meetsBadgeGoal(entry, { ...empty, [field]: target - 0.001 }), false);
    assert.equal(meetsBadgeGoal(entry, { ...empty, [field]: target }), true);
  }
  const casual = await db.user.create({ data: { name: "Casual maker", email: "casual-" + randomUUID() + "@example.test" } });
  memberIds.push(casual.id);
  const casualWish = { ...wish, uploaderId: casual.id, material: "PLA" };
  const easyAward = (key: string) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: casual.id, badgeKey: key } } });
  const easyNotes = (key: string) => db.notification.count({ where: { recipientId: casual.id, badgeKey: key } });
  const failedRequest = await db.story.create({ data: casualWish });
  await assert.rejects(createStoryWithBadges({ ...casualWish, id: failedRequest.id }));
  assert.equal(await easyAward(FIRST_REQUEST_BADGE), null, "failed first request awards nothing");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: casual.id } })).printSubmissionCount, 0);
  const starts = await Promise.all(Array.from({ length: 4 }, () => createStoryWithBadges({ ...casualWish, quantity: 100 })));
  const idea = (await easyAward(FIRST_REQUEST_BADGE))!;
  assert.ok(starts.some(s => s.id === idea.storyId && s.createdAt.getTime() === idea.earnedAt.getTime()));
  assert.equal(await easyNotes(FIRST_REQUEST_BADGE), 1, "simultaneous first requests announce once");
  for (const key of easyKeys.slice(1)) assert.equal(await easyAward(key), null, "requests alone cannot unlock completion goals");
  await db.story.delete({ where: { id: idea.storyId! } });
  assert.equal((await easyAward(FIRST_REQUEST_BADGE))?.earnedAt.getTime(), idea.earnedAt.getTime());
  for (const status of ["Requested", "Accepted", "Printing", "Declined"] as const) {
    const pending = await db.story.create({ data: { ...casualWish, status, filamentMeters: 1000 } });
    await checkCompletion(casual.id, pending.id);
  }
  const completions: { id: number }[] = [];
  for (let count = 1; count <= 10; count++) {
    const completed = await db.story.create({ data: { ...casualWish, status: count === 8 || count % 2 ? "Delivery" : "Done", quantity: 100, filamentMeters: count === 1 ? 49.999 : null } });
    completions.push(completed);
    await checkCompletion(other.id, completed.id);
    if (count === 3 || count === 8) {
      const rollbackKey = count === 3 ? THREE_PRINTS_BADGE : EIGHT_PRINTS_BADGE;
      await assert.rejects(db.$transaction(async tx => {
        await tx.user.update({ where: { id: casual.id }, data: { printSubmissionCount: { increment: 0 } } });
        await awardCompletedPrintBadges(tx, casual.id, completed.id);
        throw new Error("Abort casual award");
      }), /Abort casual award/);
      assert.equal(await easyAward(rollbackKey), null, "rollback leaves no partial award");
      assert.equal(await easyNotes(rollbackKey), 0);
    }
    await Promise.all(Array.from({ length: 3 }, () => checkCompletion(casual.id, completed.id)));
    for (const [key, threshold] of [[THREE_PRINTS_BADGE, 3], [FIVE_PRINTS_BADGE, 5], [EIGHT_PRINTS_BADGE, 8], [TEN_PRINTS_BADGE, 10]] as const) {
      assert.equal(Boolean(await easyAward(key)), count >= threshold, key + " uses exact completed count, not quantity");
      assert.equal(await easyNotes(key), Number(count >= threshold));
    }
    assert.equal(await easyAward(MAKING_TRACKS_BADGE), null, "unknown usage and 49.999 m stay below 50 m");
  }
  await db.story.update({ where: { id: completions[0]!.id }, data: { status: "Done", filamentMeters: 50 } });
  await Promise.all(Array.from({ length: 3 }, () => checkCompletion(casual.id, completions[0]!.id)));
  const tracks = (await easyAward(MAKING_TRACKS_BADGE))!;
  assert.ok(tracks, "50 recorded meters unlocks Making Tracks exactly");
  assert.equal(await easyNotes(MAKING_TRACKS_BADGE), 1);
  await db.story.update({ where: { id: completions[0]!.id }, data: { filamentMeters: null } });
  await checkCompletion(casual.id, completions[0]!.id);
  assert.equal((await easyAward(MAKING_TRACKS_BADGE))?.earnedAt.getTime(), tracks.earnedAt.getTime());
  const tower = (await easyAward(EIGHT_PRINTS_BADGE))!;
  assert.equal(tower.storyId, completions[7]!.id, "the eighth completion is the source of the Pisa award");
  await db.story.update({ where: { id: tower.storyId! }, data: { status: "Done" } });
  await checkCompletion(casual.id, tower.storyId!);
  assert.equal(await easyNotes(EIGHT_PRINTS_BADGE), 1, "collection after delivery never repeats the Pisa announcement");
  await db.story.delete({ where: { id: tower.storyId! } });
  assert.equal((await easyAward(EIGHT_PRINTS_BADGE))?.storyId, null);
  assert.equal((await easyAward(EIGHT_PRINTS_BADGE))?.earnedAt.getTime(), tower.earnedAt.getTime());
  const charm = (await easyAward(THREE_PRINTS_BADGE))!;
  await db.story.delete({ where: { id: charm.storyId! } });
  assert.equal((await easyAward(THREE_PRINTS_BADGE))?.earnedAt.getTime(), charm.earnedAt.getTime());
  assert.equal(await db.memberBadge.count({ where: { userId: other.id, badgeKey: { in: easyKeys } } }), 0);
  console.info("Everyday stickers passed: first-request concurrency; exact 3/5/8/10 completion and 50 m thresholds; plain PLA; quantity; unfinished prints; unknown usage; member isolation; rollback; permanent awards/dates and one-time notifications.");


  const filamentBadges = MEMBER_BADGES.filter((badge): badge is Extract<(typeof MEMBER_BADGES)[number], { goal: { kind: "filament" } }> => badge.goal.kind === "filament");
  assert.equal(filamentBadges.length, 3);
  const retiredMaterialKeys = ["abs-brick","asa-sun","nylon-gear","pc-shield","hips-support"];
  assert.ok(retiredMaterialKeys.every(key => !MEMBER_BADGES.some(badge => String(badge.key) === key)));
  const familyCases: Array<[string, string]> = [
    ["PLA", "PLA"], ["Silk PLA+", "PLA"], ["Matte PLA-CF", "PLA"], ["Tough PLA", "PLA"],
    ["PETG-CF", "PETG"], ["PET", "PETG"], ["PCTG", "PETG"], ["CPE", "PETG"], ["CoPE", "PETG"], ["Co-polyester", "PETG"],
    ["ABS-GF", "ABS"], ["ASA", "ASA"], ["TPU 95A", "TPU"], ["TPE", "TPU"], ["Flexible", "TPU"], ["Flex", "TPU"],
    ["Nylon", "Nylon"], ["PA", "Nylon"], ["PA6-CF", "Nylon"], ["PA12", "Nylon"], ["PAHT-CF", "Nylon"],
    ["PC", "PC"], ["Polycarbonate", "PC"], ["HIPS", "HIPS"],
  ];
  for (const [label, family] of familyCases) {
    assert.equal(filamentFamily(label), family, label);
    for (const badge of filamentBadges) {
      assert.equal(meetsBadgeGoal(badge, { ...progress, requestedFilamentFamily: requestedFilamentFamily(label) }), badge.goal.family === family, label);
      assert.equal(meetsBadgeGoal(badge, progress), false, "missing material never unlocks a family");
    }
  }
  for (const label of ["Auto", "PLAster", "PCTGish", "ABSorb", "CASA", "TPUish", "Nylonish", "Space", "PC123", "HIPSter", "Unknown"]) {
    assert.equal(filamentFamily(label), null, label + " is not a whole material name");
  }
  assert.equal(requestedFilamentFamily("Auto", "PLA Silk"), null);
  assert.equal(requestedFilamentFamily(" auto ", "TPU"), null);
  assert.equal(requestedFilamentFamily("Engineering", "PAHT-CF"), "Nylon");
  assert.equal(requestedFilamentFamily("PLA", "PETG"), "PETG", "saved spool type wins over broad shelf name");
  assert.equal(requestedFilamentFamily("PLA", "Unknown"), "PLA", "unrecognized spool type falls back to shelf material");
  const materialMember = await db.user.create({ data: { name: "Material sticker verification", email: "material-stickers-" + randomUUID() + "@example.test" } });
  memberIds.push(materialMember.id);
  const materialWish = { ...wish, uploaderId: materialMember.id, material: "Unknown", title: "PLA ABS TPU PC", note: "Nylon ASA HIPS PETG", colorName: "PLA", swatchMaker: "TPU" };
  const materialKeys = filamentBadges.map(badge => badge.key);
  const materialAward = (key: string) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: materialMember.id, badgeKey: key } } });
  const materialNotes = (key: string) => db.notification.count({ where: { recipientId: materialMember.id, badgeKey: key } });
  await createStoryWithBadges(materialWish);
  const automatic = await createStoryWithBadges({ ...materialWish, material: "Auto", swatchType: "PLA", quantity: 100 });
  assert.equal(await db.memberBadge.count({ where: { userId: materialMember.id, badgeKey: { in: materialKeys } } }), 0,
    "Auto, notes, titles, brands and color names cannot grant material stickers");
  await assert.rejects(createStoryWithBadges({ ...materialWish, id: automatic.id, material: "PLA" }));
  assert.equal(await materialAward("pla-corn"), null, "failed saves award nothing");
  for (const [label, family] of familyCases) {
    const badge = filamentBadges.find(badge => badge.goal.family === family);
    if (!badge) {
      await createStoryWithBadges({ ...materialWish, material: label });
      assert.equal(await db.memberBadge.count({ where: { userId: materialMember.id, badgeKey: { in: retiredMaterialKeys } } }), 0, "retired families earn no sticker");
      assert.equal(await db.notification.count({ where: { recipientId: materialMember.id, badgeKey: { in: retiredMaterialKeys } } }), 0);
      continue;
    }
    const requests = await Promise.all(Array.from({ length: 3 }, () => createStoryWithBadges({ ...materialWish, material: "Engineering", swatchType: label, quantity: 100 })));
    const award = (await materialAward(badge.key))!;
    assert.ok(award, label + " earns its family sticker");
    assert.equal(await materialNotes(badge.key), 1, "simultaneous and variant requests announce each family once");
    assert.equal((await db.notification.findFirstOrThrow({ where: { recipientId: materialMember.id, badgeKey: badge.key } })).text, badge.announcement);
    if (label === family) {
      assert.ok(requests.some(request => request.id === award.storyId));
      await db.story.delete({ where: { id: award.storyId! } });
      await createStoryWithBadges({ ...materialWish, material: label });
      const kept = (await materialAward(badge.key))!;
      assert.equal(kept.storyId, null);
      assert.equal(kept.earnedAt.getTime(), award.earnedAt.getTime(), "withdrawals preserve the original award and date");
    }
  }
  assert.equal(await db.memberBadge.count({ where: { userId: materialMember.id, badgeKey: { in: materialKeys } } }), 3);
  assert.equal(await db.memberBadge.count({ where: { userId: other.id, badgeKey: { in: materialKeys } } }), 0, "families stay with their own member");
  const mismatch = await db.user.create({ data: { name: "Spool type verification", email: "material-spool-" + randomUUID() + "@example.test" } });
  memberIds.push(mismatch.id);
  await createStoryWithBadges({ ...wish, uploaderId: mismatch.id, material: "PLA", swatchType: "PETG" });
  assert.deepEqual((await db.memberBadge.findMany({ where: { userId: mismatch.id, badgeKey: { in: materialKeys } } })).map(b => b.badgeKey), ["petg-bottle"]);
  console.info("Filament stickers passed: PLA, PETG and TPU; retired families earn no awards; variants and aliases; whole-word matching; authoritative spool type; Auto and false positives; failed saves; concurrent one-time awards/notifications; quantity; member isolation; preserved awards and dates after withdrawal.");

  const rainbow = MEMBER_BADGES.find((badge) => badge.key === ROY_G_BIV_BADGE)!;
  assert.equal(rainbow.hidden, true);
  assert.equal(rainbow.rarity, "legendary");
  assert.equal(meetsBadgeGoal(rainbow, progress), false);
  assert.equal(meetsBadgeGoal(rainbow, { ...progress, requestedRainbowFilament: true }), true);
  for (const label of ["Rainbow", "Pastel Rainbow", "PLA Silk Rainbow", "RAINBOW-PLA", "Rainbow Glitter", "Rainbow TPU"]) {
    assert.equal(isRainbowFilament(label), true, label);
  }
  for (const label of ["PLA", "Rainbowish", "Rainbowland", "Multi Color", "Gradient", "Red Green Blue", "non-rainbow PLA", "Not Rainbow", "no rainbow", "rainbow-free"]) {
    assert.equal(isRainbowFilament(label), false, label);
  }
  const spectrum = await db.user.create({ data: { name: "Rainbow verification", email: `rainbow-${randomUUID()}@example.test` } });
  memberIds.push(spectrum.id);
  const rainbowWish = { ...wish, uploaderId: spectrum.id };
  const rainbowAward = (userId = spectrum.id) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: ROY_G_BIV_BADGE } } });
  const rainbowNotes = (userId = spectrum.id) => db.notification.count({ where: { recipientId: userId, badgeKey: ROY_G_BIV_BADGE } });
  for (const colorName of ["Rainbowish", "non-rainbow PLA", "Multi Color", "Red Green Blue"]) {
    await createStoryWithBadges({ ...rainbowWish, colorName, title: "Rainbow", note: "Rainbow filament please", swatchMaker: "Rainbow Brand", colorStyle: "linear-gradient(red, yellow, blue)" });
  }
  await createStoryWithBadges({ ...rainbowWish, material: "Auto", colorName: "Rainbow", swatchType: "PLA Rainbow" });
  assert.equal(await rainbowAward(), null, "notes, titles, makers, gradients, vague/negative labels and Auto do not discover Roy G Biv");
  const rainbowFixture = await db.story.findFirstOrThrow({ where: { uploaderId: spectrum.id } });
  await assert.rejects(createStoryWithBadges({ ...rainbowWish, id: rainbowFixture.id, colorName: "Rainbow" }));
  assert.equal(await rainbowAward(), null, "failed saves cannot discover Roy G Biv");
  assert.equal(await rainbowNotes(), 0);
  const rainbowRequests = await Promise.all(Array.from({ length: 4 }, () => createStoryWithBadges({ ...rainbowWish, swatchType: "PLA Silk Rainbow", quantity: 100 })));
  const discoveredRainbow = await rainbowAward();
  assert.ok(discoveredRainbow, "the saved filament type discovers Roy G Biv even with a plain color label");
  assert.ok(rainbowRequests.some(story => story.id === discoveredRainbow.storyId && story.createdAt.getTime() === discoveredRainbow.earnedAt.getTime()));
  assert.equal(await rainbowNotes(), 1, "concurrent requests announce once");
  const rainbowNote = await db.notification.findFirstOrThrow({ where: { recipientId: spectrum.id, badgeKey: ROY_G_BIV_BADGE } });
  assert.equal(rainbowNote.text, rainbow.announcement);
  assert.equal(await rainbowAward(other.id), null, "another member cannot inherit the discovery");
  await db.story.delete({ where: { id: discoveredRainbow.storyId! } });
  await createStoryWithBadges({ ...rainbowWish, material: "Rainbow PLA" });
  const retainedRainbow = await rainbowAward();
  assert.equal(retainedRainbow?.storyId, null);
  assert.equal(retainedRainbow?.earnedAt.getTime(), discoveredRainbow.earnedAt.getTime(), "withdrawals and later requests keep the original date");
  assert.equal(await rainbowNotes(), 1);
  const shelfRainbow = await db.user.create({ data: { name: "Rainbow shelf verification", email: `rainbow-shelf-${randomUUID()}@example.test` } });
  memberIds.push(shelfRainbow.id);
  await createStoryWithBadges({ ...wish, uploaderId: shelfRainbow.id, colorName: "Pastel Rainbow" });
  assert.ok(await rainbowAward(shelfRainbow.id), "an explicitly named rainbow shelf color qualifies");
  console.info("Roy G Biv passed: legendary hidden discovery; explicit material, filament type and shelf color; false positives; Auto; failed-save rollback; concurrent one-time award and notification; member isolation; quantity; retained award and date after withdrawal.");


  const first = await createStoryWithBadges({ ...wish, quantity: 100 });
  assert.equal(await count(), 1, "quantity counts as one request");
  assert.equal(await hundred(), null, "one request for 100 copies does not earn 100 Prints");
  assert.equal(await firstBadge(member.id), null, "a saved request does not earn the first completed print");
  assert.equal(await db.notification.count({ where: { recipientId: member.id, badgeKey: FIRST_PRINT_BADGE } }), 0);

  await assert.rejects(createStoryWithBadges({ ...wish, id: first.id }));
  assert.equal(await count(), 1, "a failed save does not increment progress");
  assert.equal(await db.story.count({ where: { uploaderId: member.id } }), 1);
  for (let i = 0; i < 98; i++) await createStoryWithBadges(wish);
  assert.equal(await count(), 99);
  assert.equal(await hundred(), null, "the hundred-print sticker is still locked at 99");
  assert.equal(await db.notification.count({ where: { recipientId: member.id, badgeKey: HUNDRED_PRINTS_BADGE } }), 0);

  await db.story.delete({ where: { id: first.id } });
  assert.equal(await count(), 99, "withdrawal keeps lifetime progress");
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => createStoryWithBadges(wish)));
  assert.equal(await count(), 103, "simultaneous submissions each increment once");
  const badge = await hundred();
  assert.ok(badge, "crossing 100 concurrently earns the sticker");
  const qualifying = concurrent.find((story) => story.id === badge.storyId);
  assert.ok(qualifying);
  assert.equal(badge.earnedAt.getTime(), qualifying.createdAt.getTime());
  assert.equal(await db.memberBadge.count({ where: { userId: member.id, badgeKey: { in: [FIRST_PRINT_BADGE, HUNDRED_PRINTS_BADGE] } } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: member.id, badgeKey: HUNDRED_PRINTS_BADGE } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: member.id, badgeKey: FIRST_PRINT_BADGE } }), 0);
  assert.equal(await db.memberBadge.count({ where: { userId: other.id } }), 0, "awards stay with the submitter");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).printSubmissionCount, 0);

  await db.story.delete({ where: { id: qualifying.id } });
  await createStoryWithBadges(wish);
  const kept = await hundred();
  assert.equal(kept?.storyId, null, "withdrawal keeps the earned sticker");
  assert.equal(kept?.earnedAt.getTime(), badge.earnedAt.getTime());
  assert.equal(await count(), 104);
  assert.equal(await db.notification.count({ where: { recipientId: member.id, badgeKey: HUNDRED_PRINTS_BADGE } }), 1);
  for (const name of ["PETG-CF", "PA6-CF20", "PA6-GF30", "Carbon Fiber Nylon", "ABS fiberglass", "PETG-fibre", "PETG fiber"]) {
    assert.equal(isFiberMaterial(name), true, `${name} is a fiber material`);
  }
  for (const name of ["PLA", "PETG", "TPU", "Auto", "scaffold", "glassy PLA", "coffee PLA"]) {
    assert.equal(isFiberMaterial(name), false, `${name} is not a fiber material`);
  }
  const suffix = randomUUID().slice(0, 8);
  async function material(name: string, active = true, color: "on" | "off" | "none" = "on") {
    const row = await db.catalogMaterial.create({ data: {
      name: `${name} ${suffix}`, active,
      ...(color === "none" ? {} : { colors: { create: { name: "Slate", hex: "#4a5d78", style: "#4a5d78", active: color === "on" } } }),
    } });
    materialIds.push(row.id);
    return row;
  }
  const plainA = await material("Explorer A");
  const plainB = await material("Explorer B");
  const cf = await material("PETG-CF");
  const gf = await material("PA6-GF");
  const inactive = await material("Off shelf", false);
  const noColors = await material("No colors", true, "none");
  const noActiveColors = await material("No active colors", true, "off");
  const explorer = await db.user.create({ data: { name: "Explorer verification", email: `explorer-${randomUUID()}@example.test` } });
  memberIds.push(explorer.id);
  const explorerWish = { ...wish, uploaderId: explorer.id };
  const tried = await createStoryWithBadges({ ...explorerWish, material: plainA.name });
  await db.story.delete({ where: { id: tried.id } });
  const renamed = await db.catalogMaterial.update({ where: { id: plainA.id }, data: { name: `${plainA.name} Plus` } });
  await createStoryWithBadges({ ...explorerWish, material: renamed.name });
  await createStoryWithBadges({ ...explorerWish, material: "Auto" });
  const initialProgress = await db.user.findUniqueOrThrow({ where: { id: explorer.id } });
  assert.deepEqual(initialProgress.requestedMaterialIds, [plainA.id], "repeats, Auto, renames and withdrawals preserve one material identity");
  const available = await db.catalogMaterial.findMany({ where: { active: true, name: { not: "Auto" }, colors: { some: { active: true } } }, select: { id: true, name: true } });
  assert.ok([inactive.id, noColors.id, noActiveColors.id].every((id) => !available.some((row) => row.id === id)));
  for (const row of available.filter((row) => row.id !== plainA.id && row.id !== plainB.id && row.id !== gf.id)) {
    await createStoryWithBadges({ ...explorerWish, material: row.name });
  }
  const explorerBadge = () => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: explorer.id, badgeKey: MATERIAL_EXPLORER_BADGE } } });
  assert.equal(await explorerBadge(), null, "missing available materials keeps the sticker locked");
  const lastRequests = await Promise.all([plainB.name, gf.name].map((name) => createStoryWithBadges({ ...explorerWish, material: name })));
  const explored = await explorerBadge();
  assert.ok(explored);
  const lastMaterial = lastRequests.find((row) => row.id === explored.storyId);
  assert.ok(lastMaterial, "concurrent new materials combine to award once");
  assert.equal(explored.earnedAt.getTime(), lastMaterial.createdAt.getTime());
  await material("New shelf addition");
  await db.story.delete({ where: { id: lastMaterial.id } });
  await createStoryWithBadges({ ...explorerWish, material: renamed.name });
  const explorerProgress = await db.user.findUniqueOrThrow({ where: { id: explorer.id } });
  assert.equal(new Set(explorerProgress.requestedMaterialIds).size, explorerProgress.requestedMaterialIds.length, "concurrent requests do not duplicate material identities");
  const explorerKept = await explorerBadge();
  assert.equal(explorerKept?.storyId, null);
  assert.equal(explorerKept?.earnedAt.getTime(), explored.earnedAt.getTime(), "catalog additions do not revoke earned stickers");
  assert.equal(await db.notification.count({ where: { recipientId: explorer.id, badgeKey: MATERIAL_EXPLORER_BADGE } }), 1);

  const fiberMember = await db.user.create({ data: { name: "Fiber verification", email: `fiber-${randomUUID()}@example.test` } });
  memberIds.push(fiberMember.id);
  const fiberWish = { ...wish, uploaderId: fiberMember.id, material: cf.name };
  const firstFiber = await createStoryWithBadges({ ...fiberWish, quantity: 100 });
  await createStoryWithBadges({ ...fiberWish, material: plainB.name });
  for (let i = 0; i < 3; i++) await createStoryWithBadges({ ...fiberWish, material: i % 2 ? cf.name : gf.name });
  const fiberBadge = () => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: fiberMember.id, badgeKey: DAILY_FIBER_BADGE } } });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: fiberMember.id } })).fiberSubmissionCount, 4);
  assert.equal(await fiberBadge(), null, "four fiber requests remain locked; quantity and plain materials do not inflate progress");
  await assert.rejects(createStoryWithBadges({ ...fiberWish, id: firstFiber.id }));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: fiberMember.id } })).fiberSubmissionCount, 4);
  await db.story.delete({ where: { id: firstFiber.id } });
  const fiberConcurrent = await Promise.all(Array.from({ length: 3 }, () => createStoryWithBadges(fiberWish)));
  const fiberAward = await fiberBadge();
  assert.ok(fiberAward);
  const fiberQualifying = fiberConcurrent.find((row) => row.id === fiberAward.storyId);
  assert.ok(fiberQualifying);
  assert.equal(fiberAward.earnedAt.getTime(), fiberQualifying.createdAt.getTime());
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: fiberMember.id } })).fiberSubmissionCount, 7);
  const fiberNote = await db.notification.findMany({ where: { recipientId: fiberMember.id, badgeKey: DAILY_FIBER_BADGE } });
  assert.equal(fiberNote.length, 1);
  assert.ok(fiberNote[0]!.text.includes("daily fiber"), "the award includes the fiber joke");
  await db.story.delete({ where: { id: fiberQualifying.id } });
  await createStoryWithBadges(fiberWish);
  const fiberKept = await fiberBadge();
  assert.equal(fiberKept?.storyId, null);
  assert.equal(fiberKept?.earnedAt.getTime(), fiberAward.earnedAt.getTime());
  assert.equal(await db.notification.count({ where: { recipientId: fiberMember.id, badgeKey: DAILY_FIBER_BADGE } }), 1);
  assert.equal(await db.memberBadge.count({ where: { userId: other.id } }), 0);

  const scentedMember = await db.user.create({ data: { name: "Scent verification", email: `scent-${randomUUID()}@example.test` } });
  memberIds.push(scentedMember.id);
  const scentWish = { ...wish, uploaderId: scentedMember.id, material: "PLA" };
  const scentedProduct = recordedSwatchChoice({ id: "admin:1", name: "Rose", hex: "#e4322f", maker: "Test maker",
    type: "PLA", product: "Rose-scented", family: "PLA", source: "admin", translucent: false, pageUrl: "https://example.test/" });
  assert.equal(isScentedMaterial(scentedProduct.type), true, "a product-only scent survives the ticket's type snapshot");
  const scentBadge = (userId = scentedMember.id) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: STOP_AND_SMELL_BADGE } } });
  for (const label of ["Scented PLA", "Rose-scented PLA", "PLA SCENTED", "PLA (Coffee Scent)"]) {
    assert.equal(isScentedMaterial(label), true, `${label} is explicitly scented`);
  }
  for (const label of ["PLA", "Rose", "Coffee PLA", "Fluorescent PLA", "Pearlescent PLA", "Unscented PLA", "Non-scented PLA", "Not scented PLA", "Scent-free PLA", "No scent PLA"]) {
    assert.equal(isScentedMaterial(label), false, `${label} does not imply a scent`);
    await createStoryWithBadges({ ...scentWish, colorName: label, note: "Please use scented filament", title: "Scented test" });
  }
  await createStoryWithBadges({ ...scentWish, swatchMaker: "Scented Brand" });
  await createStoryWithBadges({ ...scentWish, material: "Auto", colorName: "Rose Scented" });
  assert.equal(await scentBadge(), null, "colours, notes, titles, makers, negative labels and Auto do not discover the sticker");
  const scentFixture = await db.story.findFirstOrThrow({ where: { uploaderId: scentedMember.id } });
  await assert.rejects(createStoryWithBadges({ ...scentWish, id: scentFixture.id, swatchType: "Scented PLA" }));
  assert.equal(await scentBadge(), null, "a failed scented submission awards nothing");
  const scentedRequests = await Promise.all(Array.from({ length: 3 }, () => createStoryWithBadges({ ...scentWish, swatchType: scentedProduct.type })));
  const scentAward = await scentBadge();
  assert.ok(scentAward, "a scented spool under plain PLA discovers the sticker");
  const scentQualifying = scentedRequests.find((request) => request.id === scentAward.storyId);
  assert.ok(scentQualifying);
  assert.equal(scentAward.earnedAt.getTime(), scentQualifying.createdAt.getTime());
  assert.equal(await db.memberBadge.count({ where: { userId: scentedMember.id, badgeKey: STOP_AND_SMELL_BADGE } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: scentedMember.id, badgeKey: STOP_AND_SMELL_BADGE } }), 1);
  await db.story.delete({ where: { id: scentQualifying.id } });
  await createStoryWithBadges({ ...scentWish, material: "Scented PLA" });
  const scentKept = await scentBadge();
  assert.equal(scentKept?.storyId, null, "withdrawal keeps the scented sticker");
  assert.equal(scentKept?.earnedAt.getTime(), scentAward.earnedAt.getTime());
  assert.equal(await db.notification.count({ where: { recipientId: scentedMember.id, badgeKey: STOP_AND_SMELL_BADGE } }), 1);
  assert.equal(await scentBadge(other.id), null, "discovery belongs only to the requester");
  const scentedColorMember = await db.user.create({ data: { name: "Scented shelf verification", email: `scent-color-${randomUUID()}@example.test` } });
  memberIds.push(scentedColorMember.id);
  await createStoryWithBadges({ ...scentWish, uploaderId: scentedColorMember.id, colorName: "Coffee Scented" });
  assert.ok(await scentBadge(scentedColorMember.id), "an explicitly scented shelf colour discovers the sticker");
  console.info("Scented checks passed: explicit material, spool-type and shelf-colour labels; false positives excluded; failed saves; concurrent one-time discovery; own-member scope; retained artwork and date after withdrawal.");

  const given = await db.memberBadge.create({ data: { userId: member.id, badgeKey: LOVE_OF_MY_LIFE_BADGE } });
  await db.user.update({ where: { id: member.id }, data: { name: "Renamed gift recipient" } });
  await db.user.update({ where: { id: other.id }, data: { name: "Recipient" } });
  await createStoryWithBadges({ ...wish, uploaderId: other.id });
  await createStoryWithBadges(wish);
  const keptGift = await db.memberBadge.findUniqueOrThrow({ where: { userId_badgeKey: { userId: member.id, badgeKey: LOVE_OF_MY_LIFE_BADGE } } });
  assert.equal(keptGift.earnedAt.getTime(), given.earnedAt.getTime(), "a renamed recipient keeps the original gift and date");
  assert.equal(keptGift.storyId, null, "the gift is independent of print requests");
  assert.equal(await db.memberBadge.count({ where: { userId: other.id, badgeKey: LOVE_OF_MY_LIFE_BADGE } }), 0,
    "renaming an account to Recipient and submitting a print cannot claim the gift");

  const completedMember = await db.user.create({ data: { name: "Completion verification", email: `completion-${randomUUID()}@example.test` } });
  memberIds.push(completedMember.id);
  for (const status of ["Requested", "Accepted", "Printing", "Declined"] as const) {
    const unfinished = await db.story.create({ data: { ...wish, uploaderId: completedMember.id, status } });
    await checkCompletion(completedMember.id, unfinished.id);
    assert.equal(await firstBadge(completedMember.id), null, `${status} does not earn a completion sticker`);
  }
  const completedPrint = await db.story.create({ data: {
    ...wish, uploaderId: completedMember.id, status: "Printing", createdAt: new Date("2026-01-01T00:00:00Z"),
  } });
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${completedMember.id} FOR UPDATE`;
    await tx.story.update({ where: { id: completedPrint.id }, data: { status: "Delivery" } });
    await awardCompletedPrintBadges(tx, completedMember.id, completedPrint.id);
    throw new Error("Abort completion");
  }), /Abort completion/);
  assert.equal(await firstBadge(completedMember.id), null, "a rolled-back completion earns no sticker");
  assert.equal(await db.notification.count({ where: { recipientId: completedMember.id, badgeKey: FIRST_PRINT_BADGE } }), 0);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${completedMember.id} FOR UPDATE`;
    await tx.story.update({ where: { id: completedPrint.id }, data: { status: "Delivery" } });
    await awardCompletedPrintBadges(tx, completedMember.id, completedPrint.id);
  });
  const completionAward = await firstBadge(completedMember.id);
  assert.ok(completionAward, "Delivery earns the sticker even with unknown filament usage");
  assert.equal(completionAward.storyId, completedPrint.id);
  assert.ok(completionAward.earnedAt > completedPrint.createdAt, "the earned date is completion, not submission");
  await checkCompletion(other.id, completedPrint.id);
  assert.equal(await firstBadge(other.id), null, "another member's completion cannot earn the sticker");
  await db.story.update({ where: { id: completedPrint.id }, data: { status: "Done", filamentMeters: 10 } });
  await Promise.all(Array.from({ length: 3 }, () => checkCompletion(completedMember.id, completedPrint.id)));
  assert.equal((await firstBadge(completedMember.id))?.earnedAt.getTime(), completionAward.earnedAt.getTime(), "collection and usage corrections keep the original completion date");
  assert.equal(await db.notification.count({ where: { recipientId: completedMember.id, badgeKey: FIRST_PRINT_BADGE } }), 1);
  console.info("Completion checks passed: submissions and unfinished/declined prints stay locked; Delivery unlocks without usage; another member's print is excluded; failed completions roll back; collection and corrections retain one award and announcement.");

  const driver = await db.user.create({ data: { name: "Two spools verification", email: `two-spools-${randomUUID()}@example.test` } });
  memberIds.push(driver.id);
  const carWish = { ...wish, uploaderId: driver.id };
  const twoSpools = (userId: string) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: TWO_SPOOLS_BADGE } } });
  const carGoal = MEMBER_BADGES.find((badge) => badge.key === TWO_SPOOLS_BADGE)!;
  assert.equal(meetsBadgeGoal(carGoal, progress), false, "requests without completed usage do not earn two spools");
  assert.equal(meetsBadgeGoal(carGoal, { ...progress, completedFilamentMeters: 659.999 }), false);
  assert.equal(meetsBadgeGoal(carGoal, { ...progress, completedFilamentMeters: 660 }), true);
  for (const status of ["Requested", "Accepted", "Printing", "Declined"] as const) {
    const unfinished = await db.story.create({ data: { ...carWish, status, filamentMeters: 100_000 } });
    await checkCompletion(driver.id, unfinished.id);
  }
  assert.equal(await twoSpools(driver.id), null, "unfinished and declined prints cannot earn two spools");
  await db.story.create({ data: { ...carWish, status: "Delivery", quantity: 100, filamentMeters: 330 } });
  await db.story.create({ data: { ...carWish, status: "Done" } });
  const carFinish = await db.story.create({ data: { ...carWish, status: "Done", filamentMeters: 329.999 } });
  await checkCompletion(driver.id, carFinish.id);
  assert.equal(await twoSpools(driver.id), null, "659.999 m stays locked; quantity and unknown usage do not inflate progress");
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${driver.id} FOR UPDATE`;
    await tx.story.update({ where: { id: carFinish.id }, data: { filamentMeters: 330 } });
    await awardCompletedPrintBadges(tx, driver.id, carFinish.id);
    throw new Error("Abort two spools");
  }), /Abort two spools/);
  assert.equal(await twoSpools(driver.id), null, "a rolled-back correction earns no car sticker");
  assert.equal(await db.notification.count({ where: { recipientId: driver.id, badgeKey: TWO_SPOOLS_BADGE } }), 0);
  await db.story.update({ where: { id: carFinish.id }, data: { filamentMeters: 330 } });
  await checkCompletion(other.id, carFinish.id);
  assert.equal(await twoSpools(other.id), null, "another member cannot claim the car sticker");
  await Promise.all(Array.from({ length: 3 }, () => checkCompletion(driver.id, carFinish.id)));
  const carAward = await twoSpools(driver.id);
  assert.ok(carAward, "exactly 660 m unlocks two spools");
  assert.equal(carAward.storyId, carFinish.id);
  assert.equal(await db.memberBadge.count({ where: { userId: driver.id, badgeKey: TWO_SPOOLS_BADGE } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: driver.id, badgeKey: TWO_SPOOLS_BADGE } }), 1);
  assert.equal(await db.memberBadge.count({ where: { userId: driver.id, badgeKey: FIVE_SPOOLS_BADGE } }), 0, "two spools does not unlock five spools");
  await db.story.update({ where: { id: carFinish.id }, data: { filamentMeters: null } });
  await checkCompletion(driver.id, carFinish.id);
  assert.equal((await twoSpools(driver.id))?.earnedAt.getTime(), carAward.earnedAt.getTime(), "usage corrections keep the car sticker and original date");
  console.info("Two-spool checks passed: exact 660 m threshold, completed totals, quantity, unknown usage, member scope, rollback, concurrent one-time award and notification, separate milestones, and retained date after correction.");

  const giraffe = await db.user.create({ data: { name: "Five spools verification", email: `spools-${randomUUID()}@example.test` } });
  memberIds.push(giraffe.id);
  const giraffeWish = { ...wish, uploaderId: giraffe.id };
  const fiveSpools = (userId: string) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: FIVE_SPOOLS_BADGE } } });
  const spoolGoal = MEMBER_BADGES.find((badge) => badge.key === FIVE_SPOOLS_BADGE)!;
  assert.equal(SPOOL_EQUIVALENT_METERS, 330);
  assert.equal(meetsBadgeGoal(spoolGoal, progress), false, "requests without completed usage do not earn five spools");
  assert.equal(meetsBadgeGoal(spoolGoal, { ...progress, completedFilamentMeters: 1649.999 }), false);
  assert.equal(meetsBadgeGoal(spoolGoal, { ...progress, completedFilamentMeters: 1650 }), true);
  for (const status of ["Requested", "Accepted", "Printing", "Declined"] as const) {
    const unfinished = await db.story.create({ data: { ...giraffeWish, status, filamentMeters: 100_000 } });
    await checkCompletion(giraffe.id, unfinished.id);
  }
  assert.equal(await fiveSpools(giraffe.id), null, "unfinished and declined prints cannot earn five spools");
  await db.story.create({ data: { ...giraffeWish, status: "Delivery", quantity: 100, filamentMeters: 660 } });
  await db.story.create({ data: { ...giraffeWish, status: "Done" } });
  const lastSpool = await db.story.create({ data: { ...giraffeWish, status: "Done", filamentMeters: 989.999 } });
  await db.story.create({ data: { ...wish, uploaderId: other.id, status: "Done", filamentMeters: 1650 } });
  await checkCompletion(giraffe.id, lastSpool.id);
  assert.equal(await fiveSpools(giraffe.id), null, "1,649.999 m stays locked; quantity, unknown usage and another member never inflate the total");
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${giraffe.id} FOR UPDATE`;
    await tx.story.update({ where: { id: lastSpool.id }, data: { filamentMeters: 990 } });
    await awardCompletedPrintBadges(tx, giraffe.id, lastSpool.id);
    throw new Error("Abort five spools");
  }), /Abort five spools/);
  assert.equal(await fiveSpools(giraffe.id), null, "a rolled-back correction earns nothing");
  assert.equal(await db.notification.count({ where: { recipientId: giraffe.id, badgeKey: FIVE_SPOOLS_BADGE } }), 0);
  await db.story.update({ where: { id: lastSpool.id }, data: { filamentMeters: 990 } });
  await checkCompletion(other.id, lastSpool.id);
  assert.equal(await fiveSpools(other.id), null, "another member cannot claim the completion");
  await Promise.all(Array.from({ length: 3 }, () => checkCompletion(giraffe.id, lastSpool.id)));
  const giraffeAward = await fiveSpools(giraffe.id);
  assert.ok(giraffeAward, "exactly 1,650 m unlocks five spools");
  assert.equal(giraffeAward.storyId, lastSpool.id);
  assert.equal(await db.memberBadge.count({ where: { userId: giraffe.id, badgeKey: FIVE_SPOOLS_BADGE } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: giraffe.id, badgeKey: FIVE_SPOOLS_BADGE } }), 1);
  await db.story.update({ where: { id: lastSpool.id }, data: { filamentMeters: null } });
  await checkCompletion(giraffe.id, lastSpool.id);
  assert.equal((await fiveSpools(giraffe.id))?.earnedAt.getTime(), giraffeAward.earnedAt.getTime(), "usage corrections keep the sticker and date");
  console.info("Five-spool checks passed: exact threshold and millimeter boundary, completed totals only, unknown usage, quantity, member scope, rollback, concurrent one-time award and notification, retained date after correction.");

  const noodle = await db.user.create({ data: { name: "Noodle verification", email: `noodle-${randomUUID()}@example.test` } });
  memberIds.push(noodle.id);
  const noodleWish = { ...wish, uploaderId: noodle.id };
  for (const status of ["Requested", "Accepted", "Printing", "Declined"] as const) {
    await db.story.create({ data: { ...noodleWish, status, filamentMeters: 100_000 } });
  }
  await db.story.create({ data: { ...noodleWish, status: "Delivery", quantity: 100, filamentMeters: 4000 } });
  await db.story.create({ data: { ...noodleWish, status: "Done" } });
  const finalMeters = await db.story.create({ data: { ...noodleWish, status: "Done", filamentMeters: 5999.999 } });
  await db.story.create({ data: { ...wish, uploaderId: other.id, status: "Done", filamentMeters: 10_000 } });
  const monster = (userId: string) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: FLYING_SPAGHETTI_MONSTER_BADGE } } });
  const checkUsage = checkCompletion;
  await checkUsage(noodle.id, finalMeters.id);
  assert.equal(await monster(noodle.id), null, "9,999.999 meters stays hidden; quantity, unknown usage, unfinished/declined prints and another member never inflate the total");
  await db.story.update({ where: { id: finalMeters.id }, data: { filamentMeters: 6000 } });
  await Promise.all(Array.from({ length: 3 }, () => checkUsage(noodle.id, finalMeters.id)));
  const discovered = await monster(noodle.id);
  assert.ok(discovered, "exactly 10,000 meters unlocks the legendary badge");
  assert.equal(discovered.storyId, finalMeters.id);
  assert.equal(await db.notification.count({ where: { recipientId: noodle.id, badgeKey: FLYING_SPAGHETTI_MONSTER_BADGE } }), 1);
  await db.story.update({ where: { id: finalMeters.id }, data: { filamentMeters: null } });
  await checkUsage(noodle.id, finalMeters.id);
  assert.equal((await monster(noodle.id))?.earnedAt.getTime(), discovered.earnedAt.getTime(), "a usage correction preserves the discovery date");
  const together = await db.user.create({ data: { name: "Concurrent noodles", email: `noodle-together-${randomUUID()}@example.test` } });
  memberIds.push(together.id);
  const pair = await Promise.all([1, 2].map(() => db.story.create({ data: { ...wish, uploaderId: together.id, status: "Printing", filamentMeters: 5000 } })));
  await Promise.all(pair.map((story) => db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${together.id} FOR UPDATE`;
    await tx.story.update({ where: { id: story.id }, data: { status: "Delivery" } });
    await awardCompletedPrintBadges(tx, together.id, story.id);
  })));
  assert.equal(await db.memberBadge.count({ where: { userId: together.id, badgeKey: FIRST_PRINT_BADGE } }), 1, "simultaneous first completions award once");
  assert.equal(await db.notification.count({ where: { recipientId: together.id, badgeKey: FIRST_PRINT_BADGE } }), 1);
  assert.ok(await fiveSpools(together.id), "simultaneous completions also unlock the lower five-spool milestone");
  assert.equal(await db.notification.count({ where: { recipientId: together.id, badgeKey: FIVE_SPOOLS_BADGE } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: together.id, badgeKey: TWO_SPOOLS_BADGE } }), 1, "crossing multiple milestones concurrently awards two spools once too");
  assert.ok(await monster(together.id), "simultaneous completed prints combine without missing the threshold");
  for (const story of pair) await db.story.update({ where: { id: story.id }, data: { status: "Done" } });
  await checkUsage(together.id, pair[0]!.id);
  assert.equal(await db.notification.count({ where: { recipientId: together.id, badgeKey: FLYING_SPAGHETTI_MONSTER_BADGE } }), 1, "collection does not repeat the discovery announcement");
  // High-usage completions still earn active milestones, never the retired sticker.
  for (const userId of [noodle.id, together.id]) {
    assert.equal(await db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: "around-the-world" } } }), null);
    assert.equal(await db.notification.count({ where: { recipientId: userId, badgeKey: "around-the-world" } }), 0);
  }

  const peakGoal = MEMBER_BADGES.find((badge) => badge.key === PEAK_PERFORMANCE_BADGE)!;
  assert.equal(MOUNT_EVEREST_METERS, 8_849);
  assert.equal(peakGoal.goal.target, MOUNT_EVEREST_METERS);
  assert.equal(meetsBadgeGoal(peakGoal, progress), false);
  assert.equal(meetsBadgeGoal(peakGoal, { ...progress, completedFilamentMeters: 8_848.999 }), false);
  assert.equal(meetsBadgeGoal(peakGoal, { ...progress, completedFilamentMeters: 8_849 }), true);
  assert.equal(meetsBadgeGoal(peakGoal, { ...progress, completedFilamentMeters: 8_849.001 }), true);
  const climber = await db.user.create({ data: { name: "Everest verification", email: "everest-" + randomUUID() + "@example.test" } });
  memberIds.push(climber.id);
  const peakWish = { ...wish, uploaderId: climber.id };
  const peakAward = (userId = climber.id) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: PEAK_PERFORMANCE_BADGE } } });
  for (const status of ["Requested", "Accepted", "Printing", "Declined"] as const) {
    const unfinished = await db.story.create({ data: { ...peakWish, status, filamentMeters: 1_000_000 } });
    await checkCompletion(climber.id, unfinished.id);
  }
  assert.equal(await peakAward(), null, "unfinished and declined prints cannot summit Everest");
  await db.story.create({ data: { ...peakWish, status: "Delivery", quantity: 100, filamentMeters: 2_000 } });
  await db.story.create({ data: { ...peakWish, status: "Done" } });
  const peakFinish = await db.story.create({ data: { ...peakWish, status: "Done", filamentMeters: 6_848.999 } });
  await db.story.create({ data: { ...wish, uploaderId: other.id, status: "Done", filamentMeters: 1_000_000 } });
  await checkCompletion(climber.id, peakFinish.id);
  assert.equal(await peakAward(), null, "one millimeter short stays locked; quantity, unknown usage and other members never inflate the total");
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${climber.id} FOR UPDATE`;
    await tx.story.update({ where: { id: peakFinish.id }, data: { filamentMeters: 6_849 } });
    await awardCompletedPrintBadges(tx, climber.id, peakFinish.id);
    throw new Error("Abort Everest ascent");
  }), /Abort Everest ascent/);
  assert.equal(await peakAward(), null);
  assert.equal(await db.notification.count({ where: { recipientId: climber.id, badgeKey: PEAK_PERFORMANCE_BADGE } }), 0);
  await db.story.update({ where: { id: peakFinish.id }, data: { filamentMeters: 6_849 } });
  await checkCompletion(other.id, peakFinish.id);
  assert.equal(await peakAward(other.id), null, "a different member cannot claim the completion");
  await Promise.all(Array.from({ length: 3 }, () => checkCompletion(climber.id, peakFinish.id)));
  const summited = (await peakAward())!;
  assert.ok(summited, "exactly 8,849 meters earns Peak Performance");
  assert.equal(summited.storyId, peakFinish.id);
  assert.equal(await db.memberBadge.count({ where: { userId: climber.id, badgeKey: PEAK_PERFORMANCE_BADGE } }), 1);
  assert.equal(await db.notification.count({ where: { recipientId: climber.id, badgeKey: PEAK_PERFORMANCE_BADGE } }), 1);
  await db.story.update({ where: { id: peakFinish.id }, data: { filamentMeters: null } });
  await checkCompletion(climber.id, peakFinish.id);
  assert.equal((await peakAward())?.earnedAt.getTime(), summited.earnedAt.getTime(), "corrections preserve the award and date");
  const peakTogether = await db.user.create({ data: { name: "Concurrent Everest", email: "everest-together-" + randomUUID() + "@example.test" } });
  memberIds.push(peakTogether.id);
  const peakPair = await Promise.all([1, 2].map(() => db.story.create({ data: { ...wish, uploaderId: peakTogether.id, status: "Printing", filamentMeters: 4_424.5 } })));
  await Promise.all(peakPair.map((story) => db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${peakTogether.id} FOR UPDATE`;
    await tx.story.update({ where: { id: story.id }, data: { status: "Delivery" } });
    await awardCompletedPrintBadges(tx, peakTogether.id, story.id);
  })));
  assert.ok(await peakAward(peakTogether.id), "simultaneous completions combine at the Everest threshold");
  assert.equal(await db.notification.count({ where: { recipientId: peakTogether.id, badgeKey: PEAK_PERFORMANCE_BADGE } }), 1);
  await db.story.update({ where: { id: peakPair[0]!.id }, data: { status: "Done" } });
  await checkCompletion(peakTogether.id, peakPair[0]!.id);
  assert.equal(await db.notification.count({ where: { recipientId: peakTogether.id, badgeKey: PEAK_PERFORMANCE_BADGE } }), 1, "collection does not count a print twice");
  console.info("Peak Performance passed: exact 8,849 m Everest threshold and millimeter boundary; completed totals; quantity; unknown usage; member scope; rollback; concurrent completions and one-time notifications; permanent award/date.");

  await db.story.delete({ where: { id: peakFinish.id } });
  assert.equal((await peakAward())?.storyId, null, "deleting the source preserves the Everest award");
  assert.equal((await peakAward())?.earnedAt.getTime(), summited.earnedAt.getTime());

  // Saved request dates drive seasonal awards; later completion dates do not.
  const holidayMember = await db.user.create({ data: { name: "Holiday verification", email: `holiday-${randomUUID()}@example.test` } });
  memberIds.push(holidayMember.id);
  const holidayWish = { ...wish, uploaderId: holidayMember.id };
  const holidayEntries = MEMBER_BADGES.filter((entry) => entry.goal.kind === "holiday");
  const holidayKeys = holidayEntries.map((entry) => entry.key);
  const seasonalAwards = () => db.memberBadge.findMany({ where: { userId: holidayMember.id, badgeKey: { in: holidayKeys } }, orderBy: { badgeKey: "asc" } });
  const seasonalNotes = () => db.notification.findMany({ where: { recipientId: holidayMember.id, badgeKey: { in: holidayKeys } } });
  await createStoryWithBadges({ ...holidayWish, createdAt: new Date("2026-10-01T03:59:59.999Z") });
  assert.equal((await seasonalAwards()).length, 0, "October in UTC before Eastern month start does not count");
  await assert.rejects(createStoryWithBadges({ ...holidayWish, id: pair[0]!.id, createdAt: new Date("2026-10-31T12:00:00Z") }));
  assert.equal((await seasonalAwards()).length, 0, "a failed first holiday request earns nothing");
  assert.equal((await seasonalNotes()).length, 0);
  await createStoryWithBadges({ ...holidayWish, createdAt: new Date("2025-04-15T12:00:00Z") });
  await createStoryWithBadges({ ...holidayWish, createdAt: new Date("2026-04-15T12:00:00Z") });
  assert.equal((await seasonalAwards()).length, 0, "Requests outside seasonal months do not count");
  const halloween = await createStoryWithBadges({ ...holidayWish, quantity: 100, createdAt: new Date("2026-10-19T12:00:00.000Z") });
  const spooky = (await seasonalAwards())[0]!;
  assert.equal(spooky.badgeKey, "halloween");
  assert.equal(spooky.storyId, halloween.id);
  assert.equal(spooky.earnedAt.getTime(), halloween.createdAt.getTime());
  await Promise.all(Array.from({ length: 3 }, () => createStoryWithBadges({ ...holidayWish, createdAt: new Date("2026-11-01T03:59:59.999Z") })));
  await createStoryWithBadges({ ...holidayWish, createdAt: new Date("2027-10-31T12:00:00Z") });
  assert.equal((await seasonalAwards()).length, 1, "simultaneous requests and later years never duplicate a sticker");
  assert.equal((await seasonalNotes()).length, 1, "one holiday announcement per member, ever");
  await db.story.delete({ where: { id: halloween.id } });
  const retained = (await seasonalAwards())[0]!;
  assert.equal(retained.storyId, null);
  assert.equal(retained.earnedAt.getTime(), spooky.earnedAt.getTime(), "withdrawal retains the original award date");

  const concurrentHoliday = await db.user.create({ data: { name: "Concurrent holiday", email: `holiday-race-${randomUUID()}@example.test` } });
  memberIds.push(concurrentHoliday.id);
  await Promise.all(Array.from({ length: 4 }, () => createStoryWithBadges({ ...wish, uploaderId: concurrentHoliday.id, createdAt: new Date("2026-07-01T04:00:00Z") })));
  assert.equal(await db.memberBadge.count({ where: { userId: concurrentHoliday.id, badgeKey: "independence-day" } }), 1, "simultaneous first holiday requests award once");
  assert.equal(await db.notification.count({ where: { recipientId: concurrentHoliday.id, badgeKey: "independence-day" } }), 1);
  assert.equal(await db.memberBadge.count({ where: { userId: other.id, badgeKey: { in: holidayKeys } } }), 0, "holiday awards stay with their submitter");

  await createStoryWithBadges({ ...holidayWish, createdAt: new Date("2026-11-01T04:00:00Z") });
  assert.equal((await seasonalAwards()).length, 2, "November 1 opens Thanksgiving immediately after Halloween");
  const thanksgiving = await db.memberBadge.findUniqueOrThrow({ where: { userId_badgeKey: { userId: holidayMember.id, badgeKey: "thanksgiving" } } });
  assert.equal(thanksgiving.earnedAt.toISOString(), "2026-11-01T04:00:00.000Z");
  const outsideSeason = await db.user.create({ data: { name: "Outside season", email: `outside-season-${randomUUID()}@example.test` } });
  memberIds.push(outsideSeason.id);
  for (const date of ["2026-11-27T05:00:00Z", "2026-12-26T05:00:00Z", "2027-02-15T05:00:00Z"]) {
    await createStoryWithBadges({ ...wish, uploaderId: outsideSeason.id, createdAt: new Date(date) });
  }
  assert.equal(await db.memberBadge.count({ where: { userId: outsideSeason.id, badgeKey: { in: holidayKeys } } }), 0, "requests after each holiday deadline earn no seasonal sticker");
  const overlappingSeason = await db.user.create({ data: { name: "Overlapping season", email: `overlap-season-${randomUUID()}@example.test` } });
  memberIds.push(overlappingSeason.id);
  const overlap = await createStoryWithBadges({ ...wish, uploaderId: overlappingSeason.id, createdAt: new Date("2026-12-01T05:00:00Z") });
  assert.equal(await db.memberBadge.count({ where: { userId: overlappingSeason.id, badgeKey: "3d-printing-day" } }), 0, "December 1 must not earn 3D Day");
  const printingDayRequest = await createStoryWithBadges({ ...wish, uploaderId: overlappingSeason.id, createdAt: new Date("2026-12-03T05:00:00Z") });
  const overlapAwards = await db.memberBadge.findMany({ where: { userId: overlappingSeason.id, badgeKey: { in: holidayKeys } } });
  assert.deepEqual(overlapAwards.map((award) => award.badgeKey).sort(), ["3d-printing-day", "christmas"]);
  assert.ok(overlapAwards.every((award) => {
    const source = award.badgeKey === "3d-printing-day" ? printingDayRequest : overlap;
    return award.storyId === source.id && award.earnedAt.getTime() === source.createdAt.getTime();
  }));
  assert.equal(await db.notification.count({ where: { recipientId: overlappingSeason.id, badgeKey: { in: holidayKeys } } }), 2, "overlapping windows independently award and announce each sticker");
  for (const date of ["2026-01-01", "2026-02-14", "2026-03-17", "2026-07-04", "2026-10-06", "2026-11-26", "2026-12-03", "2026-12-25"]) {
    await createStoryWithBadges({ ...holidayWish, createdAt: new Date(`${date}T12:00:00Z`) });
  }
  assert.equal((await seasonalAwards()).length, holidayEntries.length, "all seasonal stickers can be collected");
  assert.equal((await seasonalNotes()).length, holidayEntries.length);
  await Promise.all(Array.from({ length: 3 }, () => createStoryWithBadges({ ...holidayWish, createdAt: new Date("2027-12-03T12:00:00Z") })));
  assert.equal(await db.memberBadge.count({ where: { userId: holidayMember.id, badgeKey: "3d-printing-day" } }), 1, "3D Day stays a single lifetime award across years and concurrent requests");
  assert.equal(await db.notification.count({ where: { recipientId: holidayMember.id, badgeKey: "3d-printing-day" } }), 1);
  const birthdayAward = await db.memberBadge.findUniqueOrThrow({ where: { userId_badgeKey: { userId: holidayMember.id, badgeKey: "print-it-birthday" } } });
  assert.equal(birthdayAward.earnedAt.toISOString(), "2026-10-06T12:00:00.000Z");
  await Promise.all(Array.from({ length: 3 }, () => createStoryWithBadges({ ...holidayWish, createdAt: new Date("2027-10-07T03:59:59.999Z") })));
  assert.equal(await db.memberBadge.count({ where: { userId: holidayMember.id, badgeKey: "print-it-birthday" } }), 1, "Birthday sticker is earned once across years and concurrent requests");
  assert.equal(await db.notification.count({ where: { recipientId: holidayMember.id, badgeKey: "print-it-birthday" } }), 1);
  await db.story.delete({ where: { id: birthdayAward.storyId! } });
  const keptBirthday = await db.memberBadge.findUniqueOrThrow({ where: { userId_badgeKey: { userId: holidayMember.id, badgeKey: "print-it-birthday" } } });
  assert.equal(keptBirthday.storyId, null);
  assert.equal(keptBirthday.earnedAt.getTime(), birthdayAward.earnedAt.getTime());
  const snapshot = await seasonalAwards();
  await assert.rejects(createStoryWithBadges({ ...holidayWish, id: pair[0]!.id, createdAt: new Date("2028-01-01T12:00:00Z") }));
  assert.deepEqual(await seasonalAwards(), snapshot, "failed saves leave awards unchanged");
  assert.equal((await seasonalNotes()).length, holidayEntries.length);
  const anniversaryMember = await db.user.create({ data: { name: "Anniversary verification", email: `anniversary-${randomUUID()}@example.test`, createdAt: new Date("2026-04-01T03:30:00Z") } });
  memberIds.push(anniversaryMember.id);
  const anniversaryWish = { ...wish, uploaderId: anniversaryMember.id };
  const anniversaryAward = (userId = anniversaryMember.id) => db.memberBadge.findUnique({ where: { userId_badgeKey: { userId, badgeKey: "member-anniversary" } } });
  const anniversaryNotes = (userId = anniversaryMember.id) => db.notification.count({ where: { recipientId: userId, badgeKey: "member-anniversary" } });
  for (const date of ["2026-03-31T12:00:00Z", "2027-03-31T03:59:59.999Z", "2027-04-01T04:00:00Z"]) {
    await createStoryWithBadges({ ...anniversaryWish, createdAt: new Date(date) });
  }
  assert.equal(await anniversaryAward(), null, "Same-year membership and adjacent local dates do not qualify");
  const beforeFailure = await db.user.findUniqueOrThrow({ where: { id: anniversaryMember.id } });
  await assert.rejects(createStoryWithBadges({ ...anniversaryWish, id: pair[0]!.id, createdAt: new Date("2027-03-31T12:00:00Z") }));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: anniversaryMember.id } })).printSubmissionCount, beforeFailure.printSubmissionCount);
  assert.equal(await anniversaryAward(), null);
  assert.equal(await anniversaryNotes(), 0);
  const anniversaryRequests = await Promise.all(Array.from({ length: 4 }, () => createStoryWithBadges({ ...anniversaryWish, quantity: 100, createdAt: new Date("2027-03-31T04:00:00Z") })));
  const celebrated = (await anniversaryAward())!;
  assert.ok(celebrated);
  assert.equal(celebrated.earnedAt.toISOString(), "2027-03-31T04:00:00.000Z");
  assert.ok(anniversaryRequests.some((story) => story.id === celebrated.storyId));
  assert.equal(await db.memberBadge.count({ where: { userId: anniversaryMember.id, badgeKey: "member-anniversary" } }), 1);
  assert.equal(await anniversaryNotes(), 1, "Concurrent first requests announce the anniversary just once");
  await createStoryWithBadges({ ...anniversaryWish, createdAt: new Date("2028-04-01T03:59:59.999Z") });
  assert.equal(await anniversaryNotes(), 1, "Later years retain a single lifetime sticker");
  await db.story.delete({ where: { id: celebrated.storyId! } });
  const retainedAnniversary = (await anniversaryAward())!;
  assert.equal(retainedAnniversary.storyId, null);
  assert.equal(retainedAnniversary.earnedAt.getTime(), celebrated.earnedAt.getTime());
  assert.equal(await anniversaryAward(other.id), null);
  assert.equal(await anniversaryNotes(other.id), 0);
  const differentAnniversary = await db.user.create({ data: { name: "Different anniversary", email: `anniversary-other-${randomUUID()}@example.test`, createdAt: new Date("2026-04-01T12:00:00Z") } });
  memberIds.push(differentAnniversary.id);
  await createStoryWithBadges({ ...wish, uploaderId: differentAnniversary.id, createdAt: new Date("2027-03-31T12:00:00Z") });
  assert.equal(await anniversaryAward(differentAnniversary.id), null, "The award uses each member's canonical join date");
  const leapAnniversary = await db.user.create({ data: { name: "Leap-day anniversary", email: `anniversary-leap-${randomUUID()}@example.test`, createdAt: new Date("2024-02-29T17:00:00Z") } });
  memberIds.push(leapAnniversary.id);
  await createStoryWithBadges({ ...wish, uploaderId: leapAnniversary.id, createdAt: new Date("2025-02-28T05:00:00Z") });
  assert.ok(await anniversaryAward(leapAnniversary.id), "February 29 members celebrate February 28 in non-leap years");
  const holidayAnniversary = await db.user.create({ data: { name: "Holiday anniversary", email: `anniversary-holiday-${randomUUID()}@example.test`, createdAt: new Date("2025-01-01T17:00:00Z") } });
  memberIds.push(holidayAnniversary.id);
  await createStoryWithBadges({ ...wish, uploaderId: holidayAnniversary.id, createdAt: new Date("2026-01-01T17:00:00Z") });
  assert.ok(await anniversaryAward(holidayAnniversary.id));
  assert.ok(await db.memberBadge.findUnique({ where: { userId_badgeKey: { userId: holidayAnniversary.id, badgeKey: "new-years-day" } } }), "A matching holiday is awarded independently");
  assert.equal(await anniversaryNotes(holidayAnniversary.id), 1);
  console.info("Member anniversary integration passed: canonical personal join date, one full year, Eastern boundaries, quantity, failed-save rollback, concurrent awards, one-time notifications, later years, withdrawals, member isolation, leap-day membership and holiday overlap.");
  console.info("Holiday integration passed: all nine seasonal windows, mid-October Halloween, November rotation, holiday deadlines, overlapping December awards, Print It! birthday, Eastern boundaries, quantity, saved award dates, withdrawal retention, per-member scope, failed saves, concurrent first requests and one-time lifetime notifications.");
  console.info("Sticker checks passed: print milestones; every available material; repeated materials, Auto, inactive shelves and colors; renames and withdrawals; four/five fiber threshold, CF/GF naming, quantity, failed saves, concurrent awards and the daily-fiber joke; personal gifts stay with the recipient and cannot be claimed through submissions or profile renames.");
  console.info("Legendary checks passed: completed meters only; exact 10-kilometer threshold; millimeter precision; own-member scope; unknown usage; quantity; corrections; simultaneous completions; one discovery and notification.");
} finally {
  await db.user.deleteMany({ where: { id: { in: memberIds } } });
  await db.catalogMaterial.deleteMany({ where: { id: { in: materialIds } } });
  await db.$disconnect();
}
