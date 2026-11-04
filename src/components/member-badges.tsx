import Link from "next/link";
import { HOLIDAY_TIME_ZONE } from "@/lib/holiday-calendar";
import { StarFlare } from "@/components/star-flare";
import { MEMBER_BADGES, SPOOL_EQUIVALENT_METERS, visibleMemberBadges, type BadgeProgress } from "@/lib/badge-catalog";
import { BadgeSticker, MysterySticker } from "@/components/badge-sticker";
import { StickerPopup } from "./sticker-popup";
import styles from "./member-badges.module.css";
export { EightPrintsSticker, PeakPerformanceSticker, FirstPrintSticker, TwoSpoolsSticker, FiveSpoolsSticker, HundredPrintsSticker, MaterialExplorerSticker, DailyFiberSticker, StopAndSmellSticker, LoveOfMyLifeSticker, FlyingSpaghettiMonsterSticker, RoyGBivSticker, BadgeSticker, MysterySticker } from "@/components/badge-sticker";

type EarnedBadge = { badgeKey: string; earnedAt: Date };

function achievementProgress(badge: (typeof MEMBER_BADGES)[number], progress: BadgeProgress | undefined, collected: boolean) {
  if (!progress && !collected) return null;
  let current: number;
  let target: number;
  let unit: string;
  switch (badge.goal.kind) {
    case "rainbow":
    case "gift":
    case "holiday":
    case "anniversary": return null;
    case "materials": {
      target = progress?.availableMaterials.length ?? 0;
      if (target === 0) return null;
      current = progress!.availableMaterials.filter((material) => progress!.requestedMaterialIds.includes(material.id)).length;
      unit = "materials";
      break;
    }
    case "spools":
      current = progress?.completedFilamentMeters ?? 0;
      target = badge.goal.target * SPOOL_EQUIVALENT_METERS;
      unit = "meters";
      break;
    case "completed":
      current = progress?.completedPrints ?? 0;
      target = badge.goal.target;
      unit = "completed prints";
      break;
    case "prints":
      current = progress?.submissions ?? 0;
      target = badge.goal.target;
      unit = "requests";
      break;
    case "fiber":
      current = progress?.fiberSubmissions ?? 0;
      target = badge.goal.target;
      unit = "fiber requests";
      break;
    case "filament":
      current = progress?.requestedFilamentFamily === badge.goal.family ? 1 : 0;
      target = 1;
      unit = badge.goal.family + " requests";
      break;
    case "scented":
      current = progress?.requestedScentedFilament ? 1 : 0;
      target = 1;
      unit = "scented requests";
      break;
    case "extrusion":
      current = progress?.completedFilamentMeters ?? 0;
      target = badge.goal.target;
      unit = "meters";
      break;
  }
  // Single-request and single-print stickers have no intermediate progress to show.
  if (target === 1 && unit !== "meters") return null;
  // Collected achievements stay complete even if the available catalog changes.
  current = collected ? target : Math.min(Math.max(0, current), target);
  const count = current.toLocaleString("en-US", { useGrouping: badge.goal.kind !== "spools", maximumFractionDigits: 2, roundingMode: "floor" });
  const targetCount = target.toLocaleString("en-US", { useGrouping: badge.goal.kind !== "spools" });
  return { current, target, targetCount, count, unit };
}

export function MemberBadges({ earned, progress }: { earned: EarnedBadge[]; progress?: BadgeProgress }) {
  // Earned stickers stay in the collection after their seasonal window closes.
  // Hidden discoveries keep their neutral silhouette until earned.
  const badges = visibleMemberBadges(earned.map((award) => award.badgeKey), new Date());
  const collected = badges.filter((badge) => earned.some((e) => e.badgeKey === badge.key)).length;

  return (
    <section id="badges" aria-labelledby="badges-heading" className={styles.collection}>
      <div className={styles.heading}>
        <h2 id="badges-heading">
          Your stickers
          <StarFlare size={26} className="rotate-12" />
        </h2>
        <span>{collected}/{badges.length} collected</span>
      </div>
      <div className={styles.folio}>
        <div className={styles.panel}>
          <div className={styles.stickers}>
            {badges.map((badge, index) => {
              const award = earned.find((e) => e.badgeKey === badge.key);
              if ("hidden" in badge && badge.hidden && !award) {
                return (
                  <article key={`mystery-${index}`} data-badge="mystery" data-earned="false" aria-label="Undiscovered sticker" className={styles.mystery}>
                    <StickerPopup title="Still to discover" trigger={<>
                      <MysterySticker className={styles.mysteryArt} />
                      <span className={`${styles.label} ${styles.mysteryLabel}`}>Still to discover</span>
                    </>}>
                      <div className={styles.description}><p>Keep making and trying new filaments. This sticker is a surprise until you discover it.</p></div>
                    </StickerPopup>
                  </article>
                );
              }
              const missingMaterials = progress?.availableMaterials.filter((material) => !progress.requestedMaterialIds.includes(material.id)) ?? [];
              const completion = achievementProgress(badge, progress, Boolean(award));
              return (
                <article key={badge.key} data-badge={badge.key} data-earned={Boolean(award)} className={styles.sticker}>
                  <StickerPopup title={badge.name} trigger={<>
                      <span className={styles.art} role="img" aria-label={award ? "Collected sticker" : "Uncollected sticker"}>
                        <BadgeSticker badgeKey={badge.key} className={award ? undefined : styles.lockedArt} />
                      </span>
                      <span className={styles.label}>
                        <span role="heading" aria-level={3} className={styles.labelName}>{badge.name}</span>
                      </span>
                      {!award && completion && (
                        <span className={`${styles.progress} ${completion.unit === "meters" ? styles.meterProgress : ""}`}>
                          <progress
                            className={styles.progressBar}
                            value={completion.current}
                            max={completion.target}
                            aria-label={`${badge.name} progress`}
                            aria-valuetext={`${completion.count} of ${completion.targetCount} ${completion.unit}; ${Math.floor(completion.current / completion.target * 100)}% complete`}
                          />
                          <span className={styles.progressCount} aria-hidden="true">{completion.unit === "meters" ? <>{completion.count}m <wbr />/ {completion.targetCount}m</> : `${completion.count}/${completion.targetCount}`}</span>
                        </span>
                      )}
                  </>}>
                    <div className={styles.description}>
                      <p>{award ? badge.description : badge.requirement}</p>
                      {!award && badge.goal.kind === "anniversary" && progress?.joinedAt && (
                        <p>Your join date: <time dateTime={progress.joinedAt.toISOString()}>{progress.joinedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: HOLIDAY_TIME_ZONE })}</time>. Your anniversary is {progress.joinedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: HOLIDAY_TIME_ZONE })} each year.</p>
                      )}
                      {!award && badge.goal.kind === "materials" && progress && (
                        progress.availableMaterials.length === 0
                          ? <p>No materials are available yet.</p>
                          : missingMaterials.length > 0 && <p>Still to try: {missingMaterials.map((material) => material.name).join(", ")}.</p>
                      )}
                      {award ? (
                        <p className={styles.date}>
                          Collected <time dateTime={award.earnedAt.toISOString()}>{award.earnedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: (badge.goal.kind === "holiday" || badge.goal.kind === "anniversary") ? HOLIDAY_TIME_ZONE : "UTC" })}</time> · Yours to keep
                        </p>
                      ) : (
                        <Link href={(badge.goal.kind === "completed" || badge.goal.kind === "spools" || badge.goal.kind === "extrusion") ? "/me" : "/upload"} className={styles.action}>{(badge.goal.kind === "completed" || badge.goal.kind === "spools" || badge.goal.kind === "extrusion") ? "View your prints →" : "Submit a print →"}</Link>
                      )}
                    </div>
                  </StickerPopup>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
