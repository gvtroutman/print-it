"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

export type FeaturePanel = { key: string; label: string; hint: string; color: string; count: number; content: ReactNode };

export function FeaturePanels({ panels, filtered }: { panels: FeaturePanel[]; filtered: boolean }) {
  const [activeKey, setActiveKey] = useState(() => (panels.find(panel => panel.count > 0) ?? panels[0]).key);
  const swipe = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  const swiped = useRef(false);
  const activeIndex = panels.findIndex(panel => panel.key === activeKey);

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    swipe.current = null;
    if (event.pointerType !== "touch" || !event.isPrimary || window.matchMedia("(min-width: 48rem)").matches) return;
    if ((event.target as Element).closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider']")) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  }

  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const gesture = swipe.current;
    if (!gesture || gesture.id !== event.pointerId || gesture.dragging) return;
    const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
    if (dy > 10 && dy >= dx) { swipe.current = null; return; }
    if (dx < 10 || dx <= dy * 1.25) return;
    gesture.dragging = true;
    // Capture horizontal drags only, so taps still open request links.
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const gesture = swipe.current;
    swipe.current = null;
    if (!gesture || gesture.id !== event.pointerId || !gesture.dragging) return;
    swiped.current = true;
    window.setTimeout(() => { swiped.current = false; }, 0);
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.25 || window.matchMedia("(min-width: 48rem)").matches) return;
    setActiveKey(current => {
      const index = panels.findIndex(panel => panel.key === current);
      return panels[Math.max(0, Math.min(panels.length - 1, index + (dx < 0 ? 1 : -1)))].key;
    });
  }

  return <>
    <div className="mb-[16px] flex flex-col items-center">
      <div role="group" aria-label="Choose a feature request panel" className="relative isolate flex gap-[4px]">
        <span aria-hidden="true" className="absolute inset-x-[22px] top-1/2 -z-10 h-[2px] -translate-y-1/2 bg-rule" />
        {panels.map((panel, index) => <button
          key={panel.key}
          type="button"
          aria-label={`${panel.label} panel`}
          aria-controls={`feature-panel-${panel.key}`}
          aria-pressed={activeKey === panel.key}
          title={panel.label}
          onClick={() => setActiveKey(panel.key)}
          onPointerUp={event => {
            if (event.pointerType !== "touch") return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) setActiveKey(panel.key);
          }}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % panels.length
              : event.key === "ArrowLeft" ? (index + panels.length - 1) % panels.length
              : event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            setActiveKey(panels[next].key);
            event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
          }}
          className="flex h-[44px] w-[44px] touch-manipulation cursor-pointer items-center justify-center rounded-full"
        ><span aria-hidden="true" className={`h-[16px] w-[16px] rounded-full border-2 border-ink transition-[background-color,transform] duration-200 motion-reduce:transition-none ${activeKey === panel.key ? "scale-125 bg-ink" : "bg-porcelain"}`} /></button>)}
      </div>
      <p aria-live="polite" aria-atomic="true" className="m-0 text-[12px] font-bold text-ink-2">{panels[activeIndex].label} · {activeIndex + 1} of {panels.length}</p>
      <p className="mb-0 mt-[4px] text-[11px] text-ink-3 md:hidden">Swipe left or right to switch panels</p>
    </div>
    <div
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={() => { swipe.current = null; }}
      onLostPointerCapture={event => { if (event.target === event.currentTarget) swipe.current = null; }}
      onClickCapture={event => {
        if (!swiped.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      className="grid touch-pan-y touch-pinch-zoom items-start gap-[15px] md:touch-auto md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      {panels.map(panel => <section
        key={panel.key}
        id={`feature-panel-${panel.key}`}
        aria-labelledby={`feature-stage-${panel.key}`}
        onPointerDownCapture={() => setActiveKey(panel.key)}
        onFocusCapture={() => setActiveKey(panel.key)}
        className={`min-w-0 rounded-panel border-[3px] border-ink transition-opacity duration-200 motion-reduce:transition-none ${panel.color} ${activeKey === panel.key ? "block opacity-100" : "hidden md:block md:opacity-40"}`}
      >
        <header className="border-b-2 border-ink px-[14px] py-[14px]">
          <div className="flex items-center justify-between gap-[8px]">
            <h2 id={`feature-stage-${panel.key}`} className="m-0 text-[23px] text-ink">{panel.label}</h2>
            <span className="rounded-chip border-2 border-ink bg-porcelain px-[9px] py-[2px] font-mono text-[12px] font-bold text-ink">{panel.count}</span>
          </div>
          <p className="mb-0 mt-[4px] text-[12px] text-ink-2">{panel.hint}</p>
        </header>
        <div className="flex flex-col gap-[12px] p-[10px]">
          {panel.content}
          {!panel.count && <p className="m-0 rounded-card border-2 border-dashed border-rule px-[14px] py-[30px] text-center text-[12px] text-ink-3">{filtered ? "No matching requests" : `Nothing in ${panel.label.toLowerCase()}`}</p>}
        </div>
      </section>)}
    </div>
  </>;
}
