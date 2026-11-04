"use client";

import { useEffect, useRef, useState } from "react";
import { markRead } from "@/app/actions/notifications";
import { BadgeCelebration } from "@/components/badge-celebration";
import { MEMBER_BADGES } from "@/lib/badge-catalog";

export type BadgeAwardNotice = { id: string; badgeKey: string | null };

/** Mounted once per header, shared by desktop and mobile. Preview never uses it. */
export function BadgeAwardListener({ awards, userId }: { awards: BadgeAwardNotice[]; userId: string }) {
  const [queue, setQueue] = useState<BadgeAwardNotice[]>([]);
  const seen = useRef(new Set<string>());
  const [available, setAvailable] = useState(false);
  const storageKey = `print-it:badge-reveals:${userId}`;

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(saved)) saved.forEach(id => { if (typeof id === "string") seen.current.add(id); });
    } catch { /* Storage can be disabled; notification read state still persists. */ }
    setQueue(current => {
      const ids = new Set(current.map(notice => notice.id));
      return [...current, ...awards.filter(notice => !seen.current.has(notice.id) && !ids.has(notice.id) && MEMBER_BADGES.some(badge => badge.key === notice.badgeKey))];
    });
  }, [awards, storageKey]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const checkAvailability = () => setAvailable(document.visibilityState === "visible" && !document.querySelector("dialog[open]:not([data-badge-celebration])"));
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications?unread=true&limit=100", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const notices: BadgeAwardNotice[] = data.notifications ?? [];
        if (disposed) return;
        setQueue(current => {
          const ids = new Set(current.map(notice => notice.id));
          return [...current, ...notices.filter(notice => !seen.current.has(notice.id) && !ids.has(notice.id) && MEMBER_BADGES.some(badge => badge.key === notice.badgeKey)).reverse()];
        });
      } catch { /* A transient feed failure must never interrupt making a print. */ }
    };
    checkAvailability();
    const availability = window.setInterval(checkAvailability, 1000);
    const interval = window.setInterval(() => void poll(), 30000);
    const focus = () => { checkAvailability(); void poll(); };
    window.addEventListener("focus", focus);
    return () => { disposed = true; controller.abort(); clearInterval(interval); clearInterval(availability); window.removeEventListener("focus", focus); };
  }, []);

  const notice = queue[0];
  const badge = notice && MEMBER_BADGES.find(candidate => candidate.key === notice.badgeKey);
  if (!available || !badge) return null;
  return <BadgeCelebration key={notice.id} badge={badge} onClose={() => {
    seen.current.add(notice.id);
    try { sessionStorage.setItem(storageKey, JSON.stringify([...seen.current].slice(-200))); } catch { /* Optional cache. */ }
    setQueue(current => current.filter(candidate => candidate.id !== notice.id));
    void markRead(notice.id).catch(() => undefined);
  }} />;
}
