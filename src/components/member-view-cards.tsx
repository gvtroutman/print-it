"use client";

import { useFormStatus } from "react-dom";
import { selectMemberViewAction } from "@/app/actions/preview";
import { MemberCard, type MemberCardProps } from "@/components/member-card";
import styles from "./member-view-cards.module.css";

function ViewCard({ card, active }: { card: MemberCardProps; active: boolean }) {
  const { pending, data } = useFormStatus();
  const view = card.role === "admin" ? "admin" : "member";
  const label = view === "admin" ? "Admin" : "Member";
  const switching = pending && data?.get("view") === view;
  const inFront = pending ? switching : active;

  return (
    <div className={styles.option} data-active={inFront}>
      <MemberCard {...card} linked={false} shine={inFront} />
      <button
        type="submit"
        name="view"
        value={view}
        disabled={active || pending}
        aria-pressed={active}
        aria-busy={switching}
        aria-label={active ? `${label} view selected` : `Switch to ${label} view`}
        className={styles.select}
      />
    </div>
  );
}

function SwitchStatus() {
  const { pending, data } = useFormStatus();
  return <span role="status" className="sr-only">{pending ? `Switching to ${data?.get("view") === "admin" ? "Admin" : "Member"} view…` : ""}</span>;
}

/** The owner can select either card while staying on their account page. */
export function MemberViewCards({ current, alternate }: { current: MemberCardProps; alternate: MemberCardProps }) {
  const cards = current.role === "admin" ? [current, alternate] : [alternate, current];
  return (
    <form action={selectMemberViewAction} aria-label="Choose your view" className={styles.cards}>
      {cards.map(card => <ViewCard key={card.role} card={card} active={card.role === current.role} />)}
      <SwitchStatus />
    </form>
  );
}
