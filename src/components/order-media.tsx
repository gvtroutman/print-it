"use client";

import { useState } from "react";

import { ModelViewer } from "@/components/model-viewer";
import { extensionOf, formatBytes } from "@/lib/upload-limits";

/**
 * Everything that came with an order, one at a time on a stage.
 *
 * The main model is always first and is what opens; whatever else was sent —
 * another part, a photo of where it goes, a clip of the thing it fixes — sits
 * on a strip below and takes the stage when picked. A model gets the 3D
 * viewer, a photo an <img>, a video the browser's own player.
 *
 * Every `src` is one of the app's own scoped routes, so `img-src` and
 * `media-src` stay at 'self'. An order with only its model shows no strip at
 * all, and looks exactly as a ticket always has.
 */

export type MediaItem = {
  key: string;
  kind: "model" | "image" | "video";
  filename: string;
  fileSize: number;
  dims: string | null;
  src: string;
  /** Null for the main model, whose download has its own control below. */
  downloadHref: string | null;
};

export function OrderMedia({ items, colorHex }: { items: MediaItem[]; colorHex: string }) {
  const [selected, setSelected] = useState(0);
  const item = items[selected] ?? items[0]!;

  return (
    <div>
      <div role="tabpanel" id="order-media-stage" aria-label={item.filename}>
        {item.kind === "model" ? (
          <ModelViewer
            key={item.key}
            src={item.src}
            filename={item.filename}
            colorHex={colorHex}
            dims={item.dims}
            fileSize={item.fileSize}
          />
        ) : item.kind === "image" ? (
          <ImageStage key={item.key} item={item} />
        ) : (
          <VideoStage key={item.key} item={item} />
        )}
      </div>

      {/* What is on the stage, when it is not the main model — the main
          model's name and size are already in the chips below the viewer. */}
      {item.key !== "main" && (
        <p className="m-0 mt-[11px] flex flex-wrap items-baseline gap-x-[11px] gap-y-[4px] font-mono text-[12px] text-ink-2">
          <span className="min-w-0 break-words font-bold text-ink">{item.filename}</span>
          <span>{[item.dims, formatBytes(item.fileSize)].filter(Boolean).join(" · ")}</span>
          {item.downloadHref && (
            <a
              href={item.downloadHref}
              className="font-bold uppercase tracking-[0.04em] text-ink-2 underline underline-offset-4 hover:text-cherry-dk"
            >
              ↓ Download
            </a>
          )}
        </p>
      )}

      {items.length > 1 && (
        <div
          role="tablist"
          aria-label="Files in this order"
          className="mt-[13.2px] flex gap-[8.8px] overflow-x-auto pb-[4px]"
        >
          {items.map((it, i) => {
            const active = i === selected;
            return (
              <button
                key={it.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="order-media-stage"
                title={it.filename}
                onClick={() => setSelected(i)}
                className={`relative h-[72px] w-[72px] flex-none cursor-pointer overflow-hidden rounded-card border-[3px] p-0 transition-transform ${
                  active ? "border-cherry-dk ring-[3px] ring-cherry-dk ring-offset-2 ring-offset-cream" : "border-ink hover:-translate-y-[2px]"
                }`}
              >
                <Thumb item={it} />
                {i === 0 && (
                  <span className="absolute left-0 top-0 rounded-br-[6px] bg-ink px-[5px] py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-cream">
                    main
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Thumb({ item }: { item: MediaItem }) {
  if (item.kind === "image") {
    // The photo itself, scaled down by the browser. These are a handful of
    // files on one ticket, so a separate thumbnail size is not worth storing.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.src} alt="" loading="lazy" className="h-full w-full bg-cream-2 object-cover" />;
  }
  return (
    <span
      className={`flex h-full w-full flex-col items-center justify-center gap-[2px] ${
        item.kind === "video" ? "bg-ink text-cream" : "bg-aqua-wash text-ink"
      }`}
    >
      <span aria-hidden className="text-[22px] leading-none">
        {item.kind === "video" ? "▶" : "◆"}
      </span>
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em]">
        {extensionOf(item.filename).slice(1) || item.kind}
      </span>
    </span>
  );
}

function ImageStage({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <NoPreview item={item} what="photo" />;
  return (
    <div className="overflow-hidden rounded-panel border-[3px] border-ink bg-cream-2 shadow-stamp-lg">
      {/* Opens full size in a new tab — the route serves photos inline. */}
      <a href={item.src} target="_blank" rel="noopener" className="block" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt={`Photo sent with the order: ${item.filename}`}
          onError={() => setFailed(true)}
          className="mx-auto block max-h-[480px] min-h-[240px] w-full object-contain"
        />
      </a>
    </div>
  );
}

function VideoStage({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <NoPreview item={item} what="video" />;
  return (
    <div className="overflow-hidden rounded-panel border-[3px] border-ink bg-ink shadow-stamp-lg">
      <video
        src={item.src}
        controls
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        aria-label={`Video sent with the order: ${item.filename}`}
        className="block max-h-[480px] min-h-[240px] w-full"
      />
    </div>
  );
}

/**
 * A photo or video this browser cannot show — most often an iPhone's HEVC
 * clip on a machine without the codec. The file is fine; the download is the
 * way to it.
 */
function NoPreview({ item, what }: { item: MediaItem; what: "photo" | "video" }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-[8px] rounded-panel border-[3px] border-ink bg-cream-2 px-[26.4px] py-[22px] text-center shadow-stamp-lg">
      <p className="m-0 font-display text-[18px] text-ink">This browser can&rsquo;t show that {what}</p>
      <p className="m-0 max-w-[40ch] text-[14px] leading-[1.5] text-ink-2">
        The file is stored as it was sent. Download it and open it with whatever
        usually plays your {what}s.
      </p>
      {item.downloadHref && (
        <a
          href={item.downloadHref}
          className="stamp mt-[4px] inline-flex items-center gap-[8px] rounded-chip border-[3px] border-ink bg-porcelain px-[15px] py-[8px] text-[14px] font-bold text-ink hover:bg-sun"
        >
          ↓ Download {item.filename}
        </a>
      )}
    </div>
  );
}
