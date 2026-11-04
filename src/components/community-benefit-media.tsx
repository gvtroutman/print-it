"use client";

import { useEffect, useRef, useState } from "react";

type BenefitMedia = {
  image: string;
  alt: string;
  video?: string;
  credit?: string;
};

/** Official H2D media, with motion only while the demo is on screen. */
export function CommunityBenefitMedia({ image, alt, video, credit }: BenefitMedia) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<"auto" | "play" | "pause">("auto");
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasSource, setHasSource] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const element = videoRef.current;
    if (!video || !frame || !element || failed) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const syncPlayback = () => {
      const allowed = playback === "play" || (playback === "auto" && !motion.matches);
      if (visible && !document.hidden && allowed) {
        // Attach the source only when a visible demo is allowed to play.
        if (!element.getAttribute("src")) {
          element.src = video;
          setHasSource(true);
        }
        void element.play().catch(() => setPlaying(false));
      } else {
        element.pause();
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      syncPlayback();
    }, { threshold: 0.25 });
    observer.observe(frame);
    motion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      element.pause();
    };
  }, [video, playback, failed]);

  return (
    <figure className="m-0">
      <div ref={frameRef} className="relative aspect-video overflow-hidden rounded-[12px] border-2 border-ink bg-black">
        <img
          src={image}
          alt={video && hasSource && !failed ? "" : alt}
          aria-hidden={video && hasSource && !failed ? true : undefined}
          width={960}
          height={540}
          loading="lazy"
          decoding="async"
          className="block h-full w-full object-contain"
        />
        {video && !failed && (
          <>
            <video
              ref={videoRef}
              poster={image}
              aria-label={alt}
              aria-hidden={!hasSource}
              muted
              loop
              playsInline
              preload="none"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setFailed(true)}
              className={`absolute inset-0 block h-full w-full object-contain ${hasSource ? "" : "invisible"}`}
            />
            <button
              type="button"
              onClick={() => setPlayback(playing ? "pause" : "play")}
              aria-label={`${playing ? "Pause" : "Play"} animation: ${alt}`}
              className="absolute bottom-[8px] right-[8px] cursor-pointer rounded-chip border-2 border-cream bg-ink px-[10px] py-[6px] font-mono text-[10.5px] font-bold uppercase tracking-[0.03em] text-cream hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
            >
              {playing ? "Pause animation" : "Play animation"}
            </button>
          </>
        )}
      </div>
      <figcaption className="mt-[4px] min-h-[15.4px] text-[11px] leading-[1.4] text-ink-3">{credit}</figcaption>
    </figure>
  );
}
