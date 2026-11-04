"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BadgeSticker } from "@/components/badge-sticker";
import { CelebrationStar } from "@/components/celebration-star";
import { MEMBER_BADGES } from "@/lib/badge-catalog";
import { STICKER_ARTWORK } from "@/lib/sticker-artwork";
import styles from "./badge-celebration.module.css";

export type CelebrationBadge = (typeof MEMBER_BADGES)[number];
const DURATION = 2000;
const DEFAULT_SPEED = 1.5;

/** One shared player for real awards and the owner's repeatable preview. */
export function BadgeCelebration({ badge, onClose, preview = false, onBadgeChange }: {
  badge: CelebrationBadge;
  onClose(): void;
  preview?: boolean;
  onBadgeChange?(key: string): void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  const flip = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const clock = useRef<Animation | null>(null);
  const rate = useRef(DEFAULT_SPEED);
  const looping = useRef(false);
  const paused = useRef(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [loop, setLoop] = useState(false);
  const [position, setPosition] = useState(0);
  const [run, setRun] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [displayBadge, setDisplayBadge] = useState(badge);
  const [starReady, setStarReady] = useState(false);
  const onStarReady = useCallback(() => setStarReady(true), []);

  const replay = useCallback(() => { paused.current = false; setPlaying(true); setRun(value => value + 1); }, []);

  useEffect(() => {
    const popup = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    return () => {
      popup.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!starReady) return;
    let disposed = false;
    const prepare = async () => {
      // The star is geometry; only the linked badge artwork needs decoding.
      const image = new Image();
      image.src = STICKER_ARTWORK[badge.key].url;
      await image.decode().catch(() => undefined);
      if (disposed) return;
      if (!dialog.current!.open) dialog.current!.showModal();
      document.body.style.overflow = "hidden";
      setDisplayBadge(badge);
      setRun(value => value + 1);
    };
    void prepare();
    return () => { disposed = true; };
  }, [badge.key, starReady]);

  useLayoutEffect(() => {
    if (!dialog.current?.open || !zoom.current || !flip.current || !copy.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(reduce);
    animations.current.forEach(animation => animation.cancel());
    const rect = zoom.current.getBoundingClientRect();
    // Four viewport diagonals keep even a portrait phone's corners inside the
    // solid yellow centre of the star, rather than in its cutouts.
    const cover = Math.max(4, 4 * Math.hypot(window.innerWidth, window.innerHeight) / rect.width);
    const timing: KeyframeAnimationOptions = { duration: reduce ? 180 : DURATION, fill: "both" };
    const shrink = zoom.current.animate(reduce ? [{ transform: "scale(1)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }] : [
      { transform: `scale(${cover})`, offset: 0 },
      { transform: `scale(${cover})`, offset: 0.055, easing: "cubic-bezier(.1,1,.15,1)" },
      { transform: "scale(1)", offset: 0.62 },
      { transform: "scale(1)", offset: 1 },
    ], timing);
    const turn = flip.current.animate(reduce ? [{ transform: "rotateX(0deg) rotateY(180deg)" }, { transform: "rotateX(0deg) rotateY(180deg)" }] : [
      { transform: "rotateX(0deg) rotateY(0deg)", offset: 0 },
      // Start turning while the star is still visibly shrinking. A gentle
      // running start makes both motions read together instead of as steps.
      { transform: "rotateX(0deg) rotateY(0deg)", offset: .3, easing: "cubic-bezier(.25,.1,.25,1)" },
      { transform: "rotateX(0deg) rotateY(180deg)", offset: 1 },
    ], timing);
    const text = copy.current.animate([
      { opacity: 0, transform: reduce ? "none" : "translateY(12px)", offset: 0 },
      { opacity: 0, transform: reduce ? "none" : "translateY(12px)", offset: reduce ? 0 : 0.76 },
      { opacity: 1, transform: "translateY(0)", offset: 1 },
    ], timing);
    animations.current = [shrink, turn, text];
    clock.current = shrink;
    animations.current.forEach(animation => { animation.playbackRate = rate.current; });
    paused.current = false;
    setPlaying(true);
    let frame: number;
    const tick = () => {
      if (!clock.current) return;
      const progress = Math.min(1, Number(clock.current.currentTime ?? 0) / Number(timing.duration));
      setPosition(Math.round(progress * 100));
      if (progress === 1) {
        if (looping.current && !paused.current) {
          animations.current.forEach(animation => { animation.currentTime = 0; animation.play(); });
        } else { setPlaying(false); if (!preview) return; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); animations.current.forEach(animation => animation.cancel()); clock.current = null; };
  }, [run]);

  const togglePlay = useCallback(() => {
    const active = animations.current.some(animation => animation.playState === "running");
    if (!active && Number(clock.current?.currentTime ?? 0) >= (reduced ? 180 : DURATION)) { replay(); return; }
    paused.current = active;
    animations.current.forEach(animation => active ? animation.pause() : animation.play());
    setPlaying(!active);
  }, [reduced, replay]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      data-badge-celebration={displayBadge.key} data-preview={preview} onClose={onClose}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        const tag = (event.target as HTMLElement).tagName;
        if (["INPUT", "SELECT", "A"].includes(tag)) return;
        if (event.key.toLowerCase() === "r") { event.preventDefault(); replay(); }
        if (preview && event.code === "Space" && tag !== "BUTTON") { event.preventDefault(); togglePlay(); }
      }}>
      <button type="button" autoFocus className={styles.close} aria-label="Close badge celebration" onClick={onClose}>×</button>
      <div className={styles.scene} tabIndex={-1}>
        <div className={styles.perspective} aria-hidden="true">
          <div ref={zoom} className={styles.zoom}>
            <CelebrationStar motion={flip} onReady={onStarReady} />
            <div ref={flip} className={styles.flip}>
              <div className={styles.back}><BadgeSticker badgeKey={displayBadge.key} /></div>
            </div>
          </div>
        </div>
        <div ref={copy} className={styles.copy}>
          <p className={styles.kicker}>{preview ? "Badge preview" : "New sticker earned!"}</p>
          <h2 id={`${id}-title`}>{displayBadge.name}</h2>
          <p id={`${id}-description`}>{displayBadge.description}</p>
          {!preview && <div className={styles.actions}>
            <button type="button" onClick={onClose}>Keep making</button>
            <button type="button" className={styles.secondary} onClick={replay}>Replay</button>
          </div>}
        </div>
      </div>
      {preview && <div className={styles.controls} aria-label="Animation preview controls">
        <div className={styles.controlRow}>
          <button type="button" onClick={replay}>↻ Replay</button>
          <button type="button" className={styles.secondary} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
          <label>Speed <select value={speed} onChange={event => {
            const next = Number(event.target.value); rate.current = next; setSpeed(next);
            animations.current.forEach(animation => animation.updatePlaybackRate(next));
          }}>{[0.25, 0.5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
          <label className={styles.check}><input type="checkbox" checked={loop} onChange={event => {
            looping.current = event.target.checked; setLoop(event.target.checked);
            if (event.target.checked && !playing) replay();
          }} />Loop</label>
          {onBadgeChange && <label className={styles.badgeSelect}>Badge <select value={badge.key} onChange={event => onBadgeChange(event.target.value)}>
            {MEMBER_BADGES.map(choice => <option key={choice.key} value={choice.key}>{choice.name}</option>)}
          </select></label>}
        </div>
        <label className={styles.timeline}>Timeline <input type="range" min="0" max="100" value={position} onChange={event => {
          const value = Number(event.target.value);
          paused.current = true;
          animations.current.forEach(animation => { animation.pause(); animation.currentTime = value / 100 * (reduced ? 180 : DURATION); });
          setPosition(value); setPlaying(false);
        }} /><output>{position}%</output></label>
        {reduced && <p className={styles.motionNote}>Reduced motion is on: the badge uses a gentle fade.</p>}
      </div>}
    </dialog>
  );
}
