"use client";

import { useState } from "react";
import { BadgeCelebration } from "@/components/badge-celebration";
import { BadgeSticker } from "@/components/badge-sticker";
import { MEMBER_BADGES } from "@/lib/badge-catalog";
import styles from "./badge-celebration.module.css";

export function BadgeAnimationLab() {
  const [key, setKey] = useState("first-print");
  const [open, setOpen] = useState(false);
  const badge = MEMBER_BADGES.find(candidate => candidate.key === key)!;
  return <>
    <section className={styles.lab}>
      <p className={styles.kicker}>Animation playground</p>
      <h1>Give every badge its moment.</h1>
      <p>A screen full of yellow, one big star, then a flip into your badge. Replay it, slow it down, scrub through it, or leave it on a loop.</p>
      <label>Choose a badge<select value={key} onChange={event => setKey(event.target.value)}>
        {MEMBER_BADGES.map(choice => <option key={choice.key} value={choice.key}>{choice.name}</option>)}
      </select></label>
      <button className={styles.launch} type="button" onClick={() => setOpen(true)}>Play badge animation →</button>
      <div className={styles.sample} aria-hidden="true"><BadgeSticker badgeKey={badge.key} /></div>
      <p>Preview as often as you like. Your awards and notifications stay as they are.</p>
    </section>
    {open && <BadgeCelebration badge={badge} preview onBadgeChange={setKey} onClose={() => setOpen(false)} />}
  </>;
}
