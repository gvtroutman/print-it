"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./member-badges.module.css";

/** The server supplies only the information this member can discover. */
export function StickerPopup({ title, trigger, children }: { title: string; trigger: ReactNode; children: ReactNode }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const popup = dialog.current;
    const overflow = document.body.style.overflow;
    popup.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      popup.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button ref={button} type="button" className={styles.trigger} aria-haspopup="dialog" aria-controls={id} aria-expanded={open} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <dialog
        ref={dialog}
        id={id}
        className={styles.popup}
        aria-labelledby={`${id}-title`}
        onClose={() => {
          setOpen(false);
          button.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            event.currentTarget.close();
          }
        }}
      >
        <div className={styles.popupHeading}>
          <h3 id={`${id}-title`}>{title}</h3>
          <button type="button" className={styles.popupClose} aria-label="Close sticker information" onClick={() => dialog.current?.close()}>×</button>
        </div>
        {children}
      </dialog>
    </>
  );
}
