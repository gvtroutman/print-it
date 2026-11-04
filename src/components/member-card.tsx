"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ARTWORK } from "@/lib/artwork-assets";
import { CARD_FLAIRS, type CardFlairKey } from "@/lib/card-flair";
import { MemberAvatar } from "@/components/member-avatar";
import { memberCardInkMask } from "@/lib/member-card-ink";
import { STICKER_ARTWORK } from "@/lib/sticker-artwork";
import styles from "./member-card.module.css";

export type MemberCardProps = {
  name: string;
  initials: string;
  email: string | null;
  role: "client" | "admin";
  joinedAt?: string;
  flair?: CardFlairKey | null;
  previewing?: boolean;
};

// The same rainbow palette and soft reveal band as the original logo foil.
// A self-contained image also works when the sticker is an externally linked SVG.
const HOLOGRAPHIC_INK = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 539.8">
  <defs>
    <linearGradient id="band" x1="-3.1%" y1="10.7%" x2="103.1%" y2="89.3%">
      <stop offset="30%" stop-color="white" stop-opacity="0"/><stop offset="37.5%" stop-color="white" stop-opacity=".04"/>
      <stop offset="45.3%" stop-color="white" stop-opacity=".34"/><stop offset="48.2%" stop-color="white" stop-opacity=".88"/>
      <stop offset="50%" stop-color="white" stop-opacity=".46"/><stop offset="53.1%" stop-color="white" stop-opacity=".1"/>
      <stop offset="63.5%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="370" y2="259" spreadMethod="repeat">
      <stop stop-color="#4defff"/><stop offset="16.67%" stop-color="#a168ff"/><stop offset="33.33%" stop-color="#ff63cf"/>
      <stop offset="50%" stop-color="#ffe96d"/><stop offset="66.67%" stop-color="#59ffc1"/>
      <stop offset="83.33%" stop-color="#79a5ff"/><stop offset="100%" stop-color="#4defff"/>
    </linearGradient>
    <linearGradient id="glints" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="110" y2="51.3" spreadMethod="repeat">
      <stop offset="44%" stop-color="white" stop-opacity="0"/><stop offset="46.67%" stop-color="white" stop-opacity=".9"/>
      <stop offset="50%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <mask id="reveal"><rect width="856" height="539.8" fill="url(#band)"/></mask>
  </defs>
  <g mask="url(#reveal)"><path fill="url(#rainbow)" d="M0 0h856v539.8H0z"/><path fill="url(#glints)" d="M0 0h856v539.8H0z"/></g>
</svg>`)}`;

/** The member's identity and join date, printed directly on their card. */
export function MemberCard({
  name,
  initials,
  role,
  joinedAt,
  flair,
  previewing,
  linked = true,
  shine = true,
  onNavigate,
}: MemberCardProps & { linked?: boolean; shine?: boolean; onNavigate?: () => void }) {
  const faceRef = useRef<HTMLSpanElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const face = faceRef.current, ink = inkRef.current;
    if (linked || !shine || !face || !ink) return;
    let disposed = false, revision = 0, scheduled = 0;
    const rebuild = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(async () => {
        const current = ++revision;
        ink.style.removeProperty("mask-image");
        try {
          const mask = await memberCardInkMask(face);
          if (disposed || current !== revision) return;
          ink.style.maskImage = `url("${mask}")`;
        } catch {
          // Keep the accessible, ordinary card if artwork/canvas is unavailable.
          if (!disposed && current === revision) ink.style.removeProperty("mask-image");
        }
      });
    };
    const size = new ResizeObserver(rebuild);
    size.observe(face);
    const content = new MutationObserver(rebuild);
    content.observe(face, { childList: true, subtree: true });
    window.addEventListener("resize", rebuild);
    rebuild();
    return () => {
      disposed = true;
      revision++;
      cancelAnimationFrame(scheduled);
      size.disconnect();
      content.disconnect();
      window.removeEventListener("resize", rebuild);
    };
  }, [linked, shine, name, initials, flair, role, previewing, joinedAt]);

  const isOwner = role === "admin" && !previewing;
  const pageName = isOwner ? "Admin" : "Member";
  const sticker = CARD_FLAIRS.find((choice) => choice.key === flair);
  const joinedDate = joinedAt ? new Date(joinedAt) : null;
  const memberSince = joinedDate && !Number.isNaN(joinedDate.getTime())
    ? joinedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
  const card = (
    <span ref={faceRef} className={`pixel-surface ${styles.cardFace}`}>
      <span className={styles.header}>
        <span className={styles.wordmark} data-card-ink="logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- shared, fixed-size brand artwork */}
          <img src={ARTWORK.wordmarkStraight} alt="Print It!" width={110} height={27} className={styles.wordmarkImage} />
        </span>
        <span className={styles.edition} data-card-ink="badge">{isOwner ? "Owner" : "Member"}</span>
      </span>
      <span className={styles.flair} data-card-ink="avatar" role="img" aria-label={sticker ? sticker.label + " profile icon" : name + "'s initials"}>
        <MemberAvatar initials={initials} flair={sticker?.key} />
        {sticker && <span aria-hidden="true" className={styles.stickerGloss} style={{ maskImage: `url("${STICKER_ARTWORK[sticker.key].url}")` }}>
          {shine && <span className={styles.stickerShine} />}
        </span>}
      </span>
      <span className={styles.cardFooter}>
        <span className={styles.details}>
          <span className={styles.name} data-card-ink="text" title={name}>{name}</span>
        </span>
        {memberSince && (
          <span className={styles.memberSince}>
            <span className={styles.eyebrow} data-card-ink="text">Member since</span>
            <time dateTime={joinedAt} className={styles.joinedDate} data-card-ink="text">{memberSince}</time>
          </span>
        )}
      </span>
      {!linked && shine && <>
        <span ref={inkRef} aria-hidden="true" className={styles.inkOverlay}>
          <span className={styles.foil} style={{ backgroundImage: `url("${HOLOGRAPHIC_INK}")` }} />
        </span>
        <span aria-hidden="true" className={styles.gloss}><span className={styles.light} /></span>
      </>}
    </span>
  );

  return (
    <div
      className={styles.profile}
      data-compact={linked || undefined}
      data-tone={previewing ? "preview" : isOwner ? "owner" : "member"}
      data-flair={sticker?.key}
    >
      {linked ? (
        <Link href="/member" onClick={onNavigate} aria-label={`${pageName} page for ${name}`} className={styles.link}>
          {card}
        </Link>
      ) : (
        <span className={styles.stage}>
          {card}
        </span>
      )}
    </div>
  );
}
