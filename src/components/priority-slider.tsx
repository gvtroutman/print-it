"use client";

import { useState } from "react";

import { DEFAULT_STORY_PRIORITY, MAX_STORY_PRIORITY, MIN_STORY_PRIORITY } from "@/lib/catalog";
import { NavIcon } from "@/components/nav-icons";
import { SLIDER } from "@/components/ui";

/**
 * How much a print matters, 1 to 100: the turtle at the slow end, the rabbit
 * at the quick one, and the whole bar between them to drag along. The
 * stickers are stops too — a tap on either jumps to its end.
 *
 * Controlled with `value` and `onChange` (the request form), or left to
 * itself with `name` and `defaultValue` inside a plain form (the ticket),
 * where the range input is what gets posted.
 */
export function PrioritySlider({
  id,
  name,
  value,
  defaultValue = DEFAULT_STORY_PRIORITY,
  onChange,
}: {
  id?: string;
  name?: string;
  value?: number;
  defaultValue?: number;
  onChange?: (priority: number) => void;
}) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const set = (n: number) => {
    setOwn(n);
    onChange?.(n);
  };

  const end = (to: number, icon: "turtle" | "rabbit", label: string) => (
    <button
      type="button"
      onClick={() => set(to)}
      aria-label={label}
      title={label}
      // Scaled up from menu size, the way the bell is, rather than resized.
      className="flex flex-none scale-[1.35] cursor-pointer border-0 bg-transparent p-0 text-ink transition-transform hover:scale-[1.5]"
    >
      <NavIcon name={icon} />
    </button>
  );

  return (
    <div className="flex items-center gap-[10px]">
      {end(MIN_STORY_PRIORITY, "turtle", `Whenever (${MIN_STORY_PRIORITY})`)}
      <input
        id={id}
        name={name}
        type="range"
        min={MIN_STORY_PRIORITY}
        max={MAX_STORY_PRIORITY}
        step={1}
        value={current}
        aria-valuetext={`${current} out of ${MAX_STORY_PRIORITY}`}
        onChange={(e) => set(Number(e.target.value))}
        // Quiet grey warming through sky to cherry, slow to quick.
        className={`${SLIDER} min-w-0 flex-1`}
        style={{ background: "linear-gradient(to right, var(--color-chrome), var(--color-sun), var(--color-cherry))" }}
      />
      {end(MAX_STORY_PRIORITY, "rabbit", `Right now (${MAX_STORY_PRIORITY})`)}
      <output
        htmlFor={id}
        aria-hidden="true"
        className="w-[34px] flex-none text-right font-mono text-[16px] font-bold tabular-nums text-ink"
      >
        {current}
      </output>
    </div>
  );
}
