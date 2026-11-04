"use client";

import { useActionState } from "react";
import { Button, Label, Notice } from "@/components/ui";
import { saveMaintenance } from "./actions";

export function MaintenanceForm({ enabled, message }: { enabled: boolean; message: string }) {
  const [state, action, pending] = useActionState(saveMaintenance, {});
  return <form action={action} className="space-y-6">
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60">
      <label className="flex cursor-pointer items-start gap-3 rounded-card border-[3px] border-ink bg-cream-2 p-5">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-cherry-dk)]" />
        <span><strong className="block text-lg">Maintenance mode</strong><span className="text-sm">Close the site to members while the printer is being repaired. Admin access stays open.</span></span>
      </label>
      <div>
        <Label htmlFor="maintenance-message">Message for members</Label>
        <textarea id="maintenance-message" name="message" defaultValue={message} rows={5} maxLength={1000} aria-describedby="maintenance-help" className="w-full resize-y rounded-card border-[3px] border-ink bg-porcelain p-4 text-base" />
        <p id="maintenance-help" className="mt-2 text-sm text-ink-2">Up to 1,000 characters. Leave blank to use the default printer repair notice.</p>
      </div>
      <Button type="submit">{pending ? "Saving…" : "Save maintenance settings"}</Button>
    </fieldset>
    <div aria-live="polite">{state.error && <Notice tone="warn">{state.error}</Notice>}{state.saved && <Notice tone="good">Maintenance settings saved.</Notice>}</div>
  </form>;
}
