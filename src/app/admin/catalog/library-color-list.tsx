"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { reorderColorsAction } from "./actions";

/** Drag with a mouse; each row also has up/down buttons for touch and keyboard. */
export function LibraryColorList({ materialId, items }: {
  materialId: string; items: { id: string; name: string; content: ReactNode }[];
}) {
  const dragged = useRef<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; saved?: boolean }>({});
  const [pending, startTransition] = useTransition();
  function drop(id: string) {
    const from = items.findIndex(item => item.id === dragged.current);
    const to = items.findIndex(item => item.id === id);
    dragged.current = null;
    setTarget(null);
    if (pending || from < 0 || to < 0 || from === to) return;
    const ids = items.map(item => item.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    const data = new FormData();
    data.set("materialId", materialId);
    data.set("ids", JSON.stringify(ids));
    data.set("previousIds", JSON.stringify(items.map(item => item.id)));
    setMessage({});
    startTransition(async () => {
      try { setMessage(await reorderColorsAction(data)); }
      catch { setMessage({ error: "The order could not be saved. Try again." }); }
    });
  }

  return <div data-library-colors aria-busy={pending}>
    <p className="m-0 mb-[10px] text-[12px] leading-[1.4] text-ink-2">Drag the ⋮⋮ handle or use ↑ ↓ to change the Library order.</p>
    <ol className={`m-0 list-none space-y-[10px] p-0 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {items.map((item, index) => <li key={item.id} data-library-color={item.id}
        onDragOver={event => {
          if (!pending && dragged.current && event.dataTransfer.types.includes("application/x-print-it-library-color")) {
            event.preventDefault(); event.dataTransfer.dropEffect = "move"; setTarget(item.id);
          }
        }}
        onDrop={event => { event.preventDefault(); drop(item.id); }}
        className={`min-w-0 rounded-card border-2 bg-cream p-[11px] ${target === item.id ? "border-aqua" : "border-dashed border-rule"}`}>
        <div className="mb-[8px] flex items-center gap-[8px]">
          <span draggable={!pending} title={`Drag ${item.name} to reorder`} aria-hidden
            onDragStart={event => {
              dragged.current = item.id; event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-print-it-library-color", item.id);
            }}
            onDragEnd={() => { dragged.current = null; setTarget(null); }}
            className="cursor-grab rounded-chip px-[7px] py-[4px] text-[18px] leading-none text-ink-2 active:cursor-grabbing">⋮⋮</span>
          <span className="font-mono text-[11px] text-ink-3">{index + 1}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-[11px]">{item.content}</div>
      </li>)}
    </ol>
    <p role={message.error ? "alert" : "status"} className={`m-0 mt-[8px] text-[12px] ${message.error ? "text-cherry-dk" : "text-ink-2"}`}>
      {pending ? "Saving Library order…" : message.error ?? (message.saved ? "Library order saved." : "")}
    </p>
  </div>;
}
