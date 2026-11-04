"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PIPELINE, type PipelineStage } from "@/lib/print-pipeline";

export type PipelineTicket = { id: number; stage: PipelineStage; search: string; blocked: boolean; card: ReactNode };
export function PipelineBoard({ tickets }: { tickets: PipelineTicket[] }) {
  const [query, setQuery] = useState("");
  const [attention, setAttention] = useState(false);
  const [activeStage, setActiveStage] = useState<PipelineStage>(() => PIPELINE.find(stage => tickets.some(t => t.stage === stage.key))?.key ?? "review");
  const boardRef = useRef<HTMLDivElement>(null);
  const selectedStage = useRef(activeStage);
  selectedStage.current = activeStage;
  const [panelHeight, setPanelHeight] = useState<number>();
  const activeIndex = PIPELINE.findIndex(stage => stage.key === activeStage);
  const needle = query.trim().toLowerCase();
  const visible = tickets.filter(t => (!needle || t.search.toLowerCase().includes(needle)) && (!attention || t.blocked));

  function selectStage(stage: PipelineStage) {
    setActiveStage(stage);
    const board = boardRef.current;
    const panel = board?.querySelector<HTMLElement>(`#pipeline-${stage}`);
    if (!board || !panel || window.matchMedia("(min-width: 48rem)").matches) return;
    board.scrollTo({ left: panel.offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  useLayoutEffect(() => {
    const board = boardRef.current!;
    let width = 0;
    const align = () => {
      if (board.clientWidth === width) return;
      width = board.clientWidth;
      const panel = board.querySelector<HTMLElement>(`#pipeline-${selectedStage.current}`);
      board.scrollTo({ left: window.matchMedia("(min-width: 48rem)").matches ? 0 : panel?.offsetLeft ?? 0, behavior: "instant" });
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  // The phone carousel follows the selected panel's height, including open forms.
  useLayoutEffect(() => {
    const panel = boardRef.current?.querySelector<HTMLElement>(`#pipeline-${activeStage}`);
    if (!panel) return;
    const measure = () => setPanelHeight(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [activeStage]);

  return <>
    <div className="mb-[20px] flex flex-wrap items-center justify-between gap-[12px]">
      <div className="flex flex-wrap gap-[8px]" role="group" aria-label="Ticket filter">
        <button onClick={() => setAttention(false)} aria-pressed={!attention} className={`cursor-pointer rounded-chip border-2 border-ink px-[13px] py-[8px] text-[13px] font-bold ${!attention ? "bg-ink text-cream" : "bg-porcelain text-ink"}`}>All active · {tickets.length}</button>
        <button onClick={() => setAttention(true)} aria-pressed={attention} className={`cursor-pointer rounded-chip border-2 border-ink px-[13px] py-[8px] text-[13px] font-bold ${attention ? "bg-cherry-dk text-cream" : "bg-porcelain text-ink"}`}>Needs attention · {tickets.filter(t => t.blocked).length}</button>
      </div>
      <label className="w-full sm:w-[320px]"><span className="sr-only">Search tickets by title, member, material or ticket number</span>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a ticket, member or material…" className="w-full rounded-chip border-2 border-ink bg-porcelain px-[13px] py-[9px] text-[13px] text-ink placeholder:text-ink-3" />
      </label>
    </div>
    <p className="sr-only" role="status">{visible.length} tickets shown</p>
    <div className="mb-[16px] flex flex-col items-center">
      <div role="group" aria-label="Choose a queue panel" className="relative isolate flex gap-[4px]">
        <span aria-hidden="true" className="absolute inset-x-[22px] top-1/2 -z-10 h-[2px] -translate-y-1/2 bg-rule" />
        {PIPELINE.map((stage, index) => <button
          key={stage.key}
          type="button"
          aria-label={`${stage.label} panel`}
          aria-controls={`pipeline-${stage.key}`}
          aria-pressed={activeStage === stage.key}
          title={stage.label}
          onClick={() => selectStage(stage.key)}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % PIPELINE.length
              : event.key === "ArrowLeft" ? (index + PIPELINE.length - 1) % PIPELINE.length
              : event.key === "Home" ? 0 : event.key === "End" ? PIPELINE.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            selectStage(PIPELINE[next].key);
            event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
          }}
          className="flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-full"
        ><span aria-hidden="true" className={`h-[16px] w-[16px] rounded-full border-2 border-ink transition-[background-color,transform] duration-200 motion-reduce:transition-none ${activeStage === stage.key ? "scale-125 bg-ink" : "bg-porcelain"}`} /></button>)}
      </div>
      <p aria-live="polite" aria-atomic="true" className="m-0 text-[12px] font-bold text-ink-2">{PIPELINE[activeIndex].label} · {activeIndex + 1} of {PIPELINE.length}</p>
      <p className="mb-0 mt-[4px] text-[11px] text-ink-3 md:hidden">Swipe left or right to switch panels</p>
    </div>
    <div
      ref={boardRef}
      onScroll={event => {
        if (window.matchMedia("(min-width: 48rem)").matches) return;
        const board = event.currentTarget;
        const index = Math.round(board.scrollLeft / (board.clientWidth + 15));
        if (PIPELINE[index]) setActiveStage(PIPELINE[index].key);
      }}
      style={{ "--pipeline-height": panelHeight === undefined ? undefined : `${panelHeight}px` } as CSSProperties}
      className="scrollbar-none relative flex h-[var(--pipeline-height)] snap-x snap-mandatory items-start gap-[15px] overflow-x-auto overflow-y-hidden overscroll-x-contain md:grid md:h-auto md:snap-none md:overflow-visible md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      {PIPELINE.map(stage => {
        const rows = visible.filter(t => t.stage === stage.key);
        const active = activeStage === stage.key;
        return <section key={stage.key} id={`pipeline-${stage.key}`} aria-labelledby={`stage-${stage.key}`} onPointerDownCapture={() => { if (window.matchMedia("(min-width: 48rem)").matches) setActiveStage(stage.key); }} onFocusCapture={() => selectStage(stage.key)} className={`w-full min-w-0 shrink-0 snap-start snap-always rounded-panel border-[3px] border-ink transition-opacity duration-200 motion-reduce:transition-none md:w-auto ${stage.color} ${active ? "opacity-100" : "md:opacity-40"}`}>
          <header className="border-b-2 border-ink px-[14px] py-[14px]">
            <div className="flex items-center justify-between gap-[8px]"><h2 id={`stage-${stage.key}`} className="m-0 text-[23px] text-ink">{stage.label}</h2><span className="rounded-chip border-2 border-ink bg-porcelain px-[9px] py-[2px] font-mono text-[12px] font-bold text-ink">{rows.length}</span></div>
            <p className="mb-0 mt-[4px] text-[12px] text-ink-2">{stage.hint}</p>
          </header>
          <div className="flex flex-col gap-[12px] p-[10px]">
            {rows.map(t => <div key={t.id}>{t.card}</div>)}
            {!rows.length && <p className="m-0 rounded-card border-2 border-dashed border-rule px-[14px] py-[30px] text-center text-[12px] text-ink-3">{needle || attention ? "No matching tickets" : `Nothing in ${stage.label.toLowerCase()}`}</p>}
          </div>
        </section>;
      })}
    </div>
  </>;
}
