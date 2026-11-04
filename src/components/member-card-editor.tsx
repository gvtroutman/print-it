"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { setCardFlairAction } from "@/app/member/card-flair-action";
import { earnedCardFlairs, type CardFlairKey } from "@/lib/card-flair";
import { MemberCard, type MemberCardProps } from "@/components/member-card";
import { MemberViewCards } from "@/components/member-view-cards";
import { BadgeSticker } from "@/components/badge-sticker";
import { MemberAvatar } from "@/components/member-avatar";
import styles from "./member-card-editor.module.css";

/** Preview and save the earned sticker used as the member's profile icon. */
export function MemberCardEditor({ earnedBadgeKeys, alternateCard, stickersEnabled = true, ...props }: MemberCardProps & { earnedBadgeKeys: readonly string[]; alternateCard?: MemberCardProps; stickersEnabled?: boolean }) {
  const group = useId();
  const choices = earnedCardFlairs(earnedBadgeKeys);
  const [selected, setSelected] = useState(props.flair ?? null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => { setSelected(props.flair ?? null); }, [props.flair]);

  function choose(next: CardFlairKey | null) {
    if (pending || next === selected) return;
    const previous = selected;
    setSelected(next);
    setError("");
    setSaved(false);
    startTransition(async () => {
      const form = new FormData();
      form.set("flair", next ?? "");
      form.set("view", props.previewing ? "member-preview" : "account");
      try {
        const result = await setCardFlairAction(form);
        if (!result.ok) {
          setSelected(previous);
          setError(result.error);
        } else {
          setSelected(result.flair);
          setSaved(true);
        }
      } catch {
        setSelected(previous);
        setError("Your profile icon could not be saved. Try again.");
      }
    });
  }

  return (
    <div className={styles.editor}>
      {alternateCard
        ? <MemberViewCards current={{ ...props, flair: stickersEnabled ? selected : null }} alternate={{ ...alternateCard, flair: stickersEnabled ? alternateCard.flair : null }} />
        : <MemberCard {...props} flair={stickersEnabled ? selected : null} linked={false} />}
      {stickersEnabled && <details className={styles.picker}>
        <summary className={styles.toggle}>{alternateCard ? `Change ${props.role === "admin" ? "Admin" : "Member"} profile icon` : selected ? "Change profile icon" : "Choose a profile icon"}</summary>
        <fieldset className={styles.fieldset} aria-busy={pending}>
          <legend className={styles.legend}>Choose an earned sticker as your profile icon.</legend>
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input type="radio" name={group} value="" checked={selected === null} disabled={pending && selected !== null} onChange={() => choose(null)} className={styles.input} />
              <span className={styles.choiceFace}>
                <span className={styles.none}><MemberAvatar initials={props.initials} /></span>
                <span>Initials</span>
              </span>
            </label>
            {choices.map((flair) => (
              <label key={flair.key} className={styles.choice}>
                <input type="radio" name={group} value={flair.key} checked={selected === flair.key} disabled={pending && selected !== flair.key} onChange={() => choose(flair.key)} className={styles.input} />
                <span className={styles.choiceFace}>
                  <BadgeSticker badgeKey={flair.key} />
                  <span>{flair.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {choices.length === 0 && <p className={styles.status}>Earn a sticker to use it as your profile icon. Your earned stickers will appear here.</p>}
        <p role="status" className={styles.status}>{pending ? "Saving profile icon…" : saved ? selected ? "Profile icon saved." : "Using your initials." : ""}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </details>}
    </div>
  );
}
