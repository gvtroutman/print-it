import { HOLIDAY_BADGES, holidayBadgesForDate, isMemberAnniversary } from "./holiday-calendar";
export { HOLIDAY_BADGES } from "./holiday-calendar";

/** Stable keys are persisted; labels and artwork can change independently. */
export const FIRST_REQUEST_BADGE = "first-request";
export const THREE_PRINTS_BADGE = "three-prints";
export const FIVE_PRINTS_BADGE = "five-prints";
export const EIGHT_PRINTS_BADGE = "eight-prints";
export const TEN_PRINTS_BADGE = "ten-prints";
export const MAKING_TRACKS_BADGE = "making-tracks";
export const FIRST_PRINT_BADGE = "first-print";
export const TWO_SPOOLS_BADGE = "two-spools";
export const FIVE_SPOOLS_BADGE = "five-spools";
export const PEAK_PERFORMANCE_BADGE = "peak-performance";
/** Everest's elevation above sea level (8,848.86 m), rounded to the nearest meter. */
export const MOUNT_EVEREST_METERS = 8_849;
// A consistent length-based equivalent, approximately one 1 kg PLA spool.
export const SPOOL_EQUIVALENT_METERS = 330;
export const HUNDRED_PRINTS_BADGE = "hundred-prints";
export const MATERIAL_EXPLORER_BADGE = "material-explorer";
export const MEMBER_ANNIVERSARY_BADGE = "member-anniversary";
export const DAILY_FIBER_BADGE = "daily-fiber";
export const STOP_AND_SMELL_BADGE = "stop-and-smell-the-filament";
export const LOVE_OF_MY_LIFE_BADGE = "love-of-my-life";
export const FLYING_SPAGHETTI_MONSTER_BADGE = "flying-spaghetti-monster";
export const ROY_G_BIV_BADGE = "roy-g-biv";
export const LEGENDARY_FILAMENT_METERS = 10_000;

export type BadgeProgress = {
  /** The saved request timestamp; calendar awards use Eastern time. */
  submittedAt?: Date;
  /** Canonical account creation time, never a date supplied by the request. */
  joinedAt?: Date;
  submissions: number;
  fiberSubmissions: number;
  requestedMaterialIds: string[];
  availableMaterials: { id: string; name: string }[];
  completedPrints?: number;
  completedFilamentMeters?: number;
  requestedFilamentFamily?: string | null;
  requestedScentedFilament?: boolean;
  requestedRainbowFilament?: boolean;
};

export const MEMBER_BADGES = [
  {
    key: FIRST_REQUEST_BADGE,
    goal: { kind: "prints", target: 1 },
    name: "Idea in Motion",
    description: "You sent your first print request. Every great make starts with an idea!",
    requirement: "Submit your first print request to earn this sticker. Any material or color counts.",
    announcement: "Sticker earned: Idea in Motion! Your first print request is on its way.",
  },
  {
    key: FIRST_PRINT_BADGE,
    goal: { kind: "completed", target: 1 },
    name: "First completed print",
    description: "Your first print is complete. You're officially a maker!",
    requirement: "Complete your first print to earn this sticker. Prints ready to collect count.",
    announcement: "Sticker earned: First completed print! Your first print is complete.",
  },
  {
    key: THREE_PRINTS_BADGE,
    goal: { kind: "completed", target: 3 },
    name: "Three’s a Charm",
    description: "Three completed prints. Your ideas are taking shape!",
    requirement: "Complete 3 prints to earn this sticker. Any material or color counts; prints ready to collect count. Each request counts once, regardless of quantity.",
    announcement: "Sticker earned: Three’s a Charm! Three of your ideas have come to life.",
  },
  {
    key: FIVE_PRINTS_BADGE,
    goal: { kind: "completed", target: 5 },
    name: "High Five",
    description: "Five completed prints. Give yourself a high five!",
    requirement: "Complete 5 prints to earn this sticker. Any material or color counts; prints ready to collect count. Each request counts once, regardless of quantity.",
    announcement: "Sticker earned: High Five! You’ve completed five prints.",
  },
  {
    key: EIGHT_PRINTS_BADGE,
    goal: { kind: "completed", target: 8 },
    name: "Leaning Tower of Prints",
    description: "Eight completed prints, stacked eight spools high. Your own little Leaning Tower of Pisa!",
    requirement: "Complete 8 prints to earn this eight-spool Leaning Tower of Pisa sticker. Any material or color counts; prints ready to collect count. Each request counts once, regardless of quantity.",
    announcement: "Sticker earned: Leaning Tower of Prints! Eight completed prints, stacked eight spools high!",
  },
  {
    key: TEN_PRINTS_BADGE,
    goal: { kind: "completed", target: 10 },
    name: "Double Digits",
    description: "Ten completed prints. Look how much you’ve made!",
    requirement: "Complete 10 prints to earn this sticker. Any material or color counts; prints ready to collect count. Each request counts once, regardless of quantity.",
    announcement: "Sticker earned: Double Digits! Ten completed prints and plenty more ideas to come.",
  },
  {
    key: MAKING_TRACKS_BADGE,
    goal: { kind: "extrusion", target: 50 },
    name: "Making Tracks",
    description: "Fifty meters of filament, turned into things you can hold. You’re making tracks!",
    requirement: "Use a total of 50 meters of filament across completed prints. Any material or color counts; prints ready to collect count. Progress updates when filament usage is recorded.",
    announcement: "Sticker earned: Making Tracks! You’ve used 50 meters of filament across your completed prints.",
  },
  {
    key: TWO_SPOOLS_BADGE,
    goal: { kind: "spools", target: 2 },
    name: "2 Spools’ Worth",
    description: "You’ve printed 2 spools’ worth of filament across your completed prints. You’re on a roll!",
    requirement: "Print a total of 2 spools’ worth of filament across completed prints: 660 m, using 330 m per spool. Prints ready to collect count.",
    announcement: "Sticker earned: 2 Spools’ Worth! You’ve printed two spools’ worth of filament across your completed prints. You’re on a roll!",
  },
  {
    key: FIVE_SPOOLS_BADGE,
    goal: { kind: "spools", target: 5 },
    name: "5 Spools’ Worth",
    description: "You’ve printed 5 spools’ worth of filament across your completed prints. That’s a whole lot of making!",
    requirement: "Print a total of 5 spools’ worth of filament across completed prints: 1,650 m, using 330 m per spool. Prints ready to collect count.",
    announcement: "Sticker earned: 5 Spools’ Worth! You’ve printed five spools’ worth of filament across your completed prints.",
  },
  {
    key: PEAK_PERFORMANCE_BADGE,
    goal: { kind: "extrusion", target: MOUNT_EVEREST_METERS },
    name: "Peak Performance",
    description: "You've printed enough filament to reach the summit of Mount Everest. One mighty mountain of making!",
    requirement: "Print a total of 8,849 meters of filament across completed prints, matching Mount Everest's height above sea level rounded to the nearest meter. Prints ready to collect count. Progress updates when filament usage is recorded.",
    announcement: "Sticker earned: Peak Performance! You've printed 8,849 meters of filament, enough to reach the summit of Mount Everest!",
  },
  {
    key: HUNDRED_PRINTS_BADGE,
    goal: { kind: "prints", target: 100 },
    name: "100 Prints",
    description: "One hundred print requests. That's a whole lot of making!",
    requirement: "Submit 100 print requests to earn this sticker. Every request counts once.",
    announcement: "Sticker earned: 100 Prints! You've submitted one hundred print requests.",
  },
  {
    key: MATERIAL_EXPLORER_BADGE,
    goal: { kind: "materials" },
    name: "Material Explorer",
    description: "You've requested every available material. The whole shelf is your playground!",
    requirement: "Request at least one print in each currently available material. Auto doesn't count as a material.",
    announcement: "Sticker earned: Material Explorer! You've requested every available material.",
  },
  {
    key: "pla-corn",
    goal: { kind: "filament", family: "PLA" },
    name: "A-maize-ing",
    description: "Your first PLA request. PLA can start with plant sugars, including corn starch. A little corn, a lot of possibility!",
    requirement: "Request a print using PLA to earn this corn sticker. PLA+, silk, matte and fiber-filled PLA count too.",
    announcement: "Sticker earned: A-maize-ing! Your first PLA request unlocked a new material sticker.",
  },
  {
    key: "petg-bottle",
    goal: { kind: "filament", family: "PETG" },
    name: "Bottle Rocket",
    description: "Your first PETG-family request. PETG is a modified relative of PET, the plastic used in many drink bottles. Your ideas are taking off!",
    requirement: "Request a print using the PETG family: PETG, PET, PCTG, CPE or CoPE. This bottle rocket celebrates their shared polyester roots.",
    announcement: "Sticker earned: Bottle Rocket! Your first PETG-family request unlocked a new material sticker.",
  },
  {
    key: "tpu-flex",
    goal: { kind: "filament", family: "TPU" },
    name: "Flex Appeal",
    description: "Your first flexible-filament request. TPU bends and bounces back. Your creativity has a little extra spring in its step!",
    requirement: "Request a print using TPU, TPE or a filament labeled Flex or Flexible to earn this bendy sneaker sticker.",
    announcement: "Sticker earned: Flex Appeal! Your first TPU request unlocked a new material sticker.",
  },
  {
    key: DAILY_FIBER_BADGE,
    goal: { kind: "fiber", target: 5 },
    name: "Daily Fiber",
    description: "Five fiber filament requests. Your printer is getting its daily fiber!",
    requirement: "Request fiber filaments 5 times. Carbon fiber (CF) and glass fiber (GF) both count.",
    announcement: "Sticker earned: Daily Fiber! Five fiber requests. Your printer is getting its daily fiber!",
  },
  {
    key: MEMBER_ANNIVERSARY_BADGE,
    goal: { kind: "anniversary" },
    name: "Maker Anniversary",
    description: "Back where your maker story began. Happy Print It! anniversary, and here’s to many more ideas!",
    requirement: "Submit a print request on the anniversary of the day you joined Print It!, Eastern time, at least one year after joining. February 29 members celebrate on February 28 in non-leap years. Collect it once and keep it every year.",
    announcement: "Sticker earned: Maker Anniversary! Happy Print It! anniversary. Thanks for another year of making!",
  },
  {
    key: HOLIDAY_BADGES.newYear,
    goal: { kind: "holiday" },
    name: "New Year, New Print",
    description: "A fresh year and a fresh idea, straight off the build plate!",
    requirement: "Submit a print request on New Year’s Day (January 1), Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: New Year, New Print! A fresh year and a fresh idea, straight off the build plate!",
  },
  {
    key: HOLIDAY_BADGES.valentine,
    goal: { kind: "holiday" },
    name: "Made with Love",
    description: "A little filament, a lot of heart. You made the Valentine’s season your own!",
    requirement: "Submit a print request between February 1 and Valentine’s Day (February 14), inclusive, Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Made with Love! A little filament, a lot of heart. You made the Valentine’s season your own!",
  },
  {
    key: HOLIDAY_BADGES.stPatrick,
    goal: { kind: "holiday" },
    name: "Lucky Layers",
    description: "A little luck in every layer. Your St. Patrick’s season print is pure gold!",
    requirement: "Submit a print request between March 1 and St. Patrick’s Day (March 17), inclusive, Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Lucky Layers! A little luck in every layer. Your St. Patrick’s season print is pure gold!",
  },
  {
    key: HOLIDAY_BADGES.independence,
    goal: { kind: "holiday" },
    name: "Stars & Spools",
    description: "Let creativity sparkle. You sent a print request for the Fourth of July!",
    requirement: "Submit a print request between July 1 and Independence Day (July 4), inclusive, Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Stars & Spools! Let creativity sparkle. You sent a print request for the Fourth of July!",
  },
  {
    key: HOLIDAY_BADGES.birthday,
    goal: { kind: "holiday" },
    name: "Happy Birthday, Print It!",
    description: "Another year of big ideas and little layers. Thanks for making things with Print It!",
    requirement: "Submit a print request between October 1 and Print It!’s birthday (October 6), inclusive, Eastern time, to earn this sticker. We started building Print It! on October 6, 2026; only that day qualifies in the founding year. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Happy Birthday, Print It! Another year of big ideas and little layers. Thanks for celebrating with us!",
  },
  {
    key: HOLIDAY_BADGES.halloween,
    goal: { kind: "holiday" },
    name: "Spooky Spools",
    description: "No tricks, just prints. A Halloween treat for your sticker collection!",
    requirement: "Submit a print request between October 1 and Halloween (October 31), inclusive, Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Spooky Spools! No tricks, just prints. A Halloween treat for your sticker collection!",
  },
  {
    key: HOLIDAY_BADGES.thanksgiving,
    goal: { kind: "holiday" },
    name: "Grateful Maker",
    description: "Good ideas, great company, and one more reason to be thankful for printing!",
    requirement: "Submit a print request between November 1 and U.S. Thanksgiving (the fourth Thursday in November), inclusive, Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Grateful Maker! Good ideas, great company, and one more reason to be thankful for printing!",
  },
  {
    key: HOLIDAY_BADGES.printingDay,
    goal: { kind: "holiday" },
    name: "Happy 3D Day",
    description: "December 3: a date made for 3D. Here’s to big ideas and the little layers that bring them to life!",
    requirement: "Submit a print request on National 3D Printing Day (December 3), Eastern time, to earn this sticker. December 3 is our kind of 3D! Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Happy 3D Day! December 3 is National 3D Printing Day. Big ideas, little layers!",
  },
  {
    key: HOLIDAY_BADGES.christmas,
    goal: { kind: "holiday" },
    name: "Merry Printmas",
    description: "A little holiday magic, one layer at a time. Merry Printmas!",
    requirement: "Submit a print request between December 1 and Christmas Day (December 25), inclusive, Eastern time, to earn this sticker. Collect it once and keep it every year.",
    announcement: "Holiday sticker earned: Merry Printmas! A little holiday magic, one layer at a time. Merry Printmas!",
  },
  {
    key: STOP_AND_SMELL_BADGE,
    goal: { kind: "scented" },
    hidden: true,
    name: "Stop & Smell the Filament 🌹",
    description: "You requested a scented filament. Making things just got a little scentsational!",
    requirement: "Request a print using a scented filament to discover this sticker.",
    announcement: "Sticker discovered: Stop & Smell the Filament 🌹! Your scented filament request is scentsational!",
  },
  {
    key: LOVE_OF_MY_LIFE_BADGE,
    goal: { kind: "gift" },
    name: "Love of My Life",
    description: "A heart-and-rings sticker for someone special.",
    requirement: "A special sticker assigned as a personal gift.",
    announcement: "A special sticker for you: Love of My Life.",
  },
  {
    key: ROY_G_BIV_BADGE,
    goal: { kind: "rainbow" },
    hidden: true,
    rarity: "legendary",
    name: "Roy G Biv",
    description: "You requested rainbow filament. Every layer is a little more colorful!",
    requirement: "Request a print using rainbow filament to discover this legendary sticker.",
    announcement: "Legendary sticker discovered: Roy G Biv! Your rainbow filament request brought the whole spectrum to life!",
  },
  {
    key: FLYING_SPAGHETTI_MONSTER_BADGE,
    goal: { kind: "extrusion", target: LEGENDARY_FILAMENT_METERS },
    hidden: true,
    rarity: "legendary",
    name: "Flying Spaghetti Monster 🍝",
    description: "Ten kilometers of filament across your completed prints. You've been touched by the noodly appendage. R'amen!",
    requirement: "Accumulate 10 kilometers of extruded filament across completed prints.",
    announcement: "Legendary sticker discovered: Flying Spaghetti Monster 🍝! Ten kilometers of filament across your completed prints. R'amen!",
  },
] as const;

export function meetsBadgeGoal(badge: (typeof MEMBER_BADGES)[number], progress: BadgeProgress): boolean {
  switch (badge.goal.kind) {
    // Personal gifts are assigned once to a member ID, never earned by prints.
    case "gift": return false;
    case "anniversary": return progress.joinedAt !== undefined && progress.submittedAt !== undefined &&
      isMemberAnniversary(progress.joinedAt, progress.submittedAt);
    case "holiday": return progress.submittedAt !== undefined && holidayBadgesForDate(progress.submittedAt).some((key) => key === badge.key);
    case "completed": return (progress.completedPrints ?? 0) >= badge.goal.target;
    case "spools": return (progress.completedFilamentMeters ?? 0) >= badge.goal.target * SPOOL_EQUIVALENT_METERS;
    case "extrusion": return (progress.completedFilamentMeters ?? 0) >= badge.goal.target;
    case "prints": return progress.submissions >= badge.goal.target;
    case "filament": return progress.requestedFilamentFamily === badge.goal.family;
    case "fiber": return progress.fiberSubmissions >= badge.goal.target;
    case "rainbow": return progress.requestedRainbowFilament === true;
    case "scented": return progress.requestedScentedFilament === true;
    case "materials": return progress.availableMaterials.length > 0 &&
      progress.availableMaterials.every((material) => progress.requestedMaterialIds.includes(material.id));
  }
}

/** Collected stickers stay visible; unearned seasonal stickers follow their preview windows. */
export function visibleMemberBadges(earnedKeys: readonly string[], date: Date) {
  const earned = new Set(earnedKeys);
  const seasonal = new Set<string>(holidayBadgesForDate(date, "preview"));
  return MEMBER_BADGES.filter((badge) => {
    if (earned.has(badge.key)) return true;
    if (badge.goal.kind === "gift") return false;
    return badge.goal.kind !== "holiday" || seasonal.has(badge.key);
  });
}
