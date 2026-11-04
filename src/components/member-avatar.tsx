import { BadgeSticker } from "@/components/badge-sticker";
import { isCardFlair, type CardFlairKey } from "@/lib/card-flair";
import styles from "./member-avatar.module.css";

/** The member's chosen collection sticker, or initials until they choose one. */
export function MemberAvatar({ initials, flair }: { initials: string; flair?: CardFlairKey | null }) {
  return (
    <span aria-hidden="true" className={styles.avatar}>
      {isCardFlair(flair) ? <BadgeSticker badgeKey={flair} /> : <span className={styles.initials}>{initials}</span>}
    </span>
  );
}
