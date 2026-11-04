"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export function TicketModelUpload({ storyId, hasModel }: { storyId: number; hasModel: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <details className="mt-[14px]" open={!hasModel}>
    <summary className="cursor-pointer text-[14px] font-bold text-ink underline underline-offset-2">{hasModel ? "Replace model before printing" : "Add the model"}</summary>
    <form className="mt-[9px] rounded-card border-2 border-ink bg-porcelain p-[13px]" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("file");
      if (!(file instanceof File) || !file.size || file.size > MAX_UPLOAD_BYTES) { setMessage("Choose a model up to 250 MB."); return; }
      setBusy(true); setMessage("");
      try {
        const response = await fetch(`/api/stories/${storyId}/model`, { method: "POST", body: data });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Upload failed.");
        form.reset(); setMessage("Model saved. Check the slice and confirm preparation again."); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Try again."); }
      finally { setBusy(false); }
    }}>
      <label className="block text-[12px] font-bold text-ink">Model file (up to 250 MB)<input name="file" type="file" required accept={ACCEPTED_EXTENSIONS.join(",")} disabled={busy} className="mt-[7px] block w-full min-w-0 text-[12px]" /></label>
      <p className="text-[12px] text-ink-2">Replacing a model resets preparation. Recheck orientation, material and copies in Studio.</p>
      <button disabled={busy} className="cursor-pointer rounded-chip border-2 border-ink bg-mint px-[12px] py-[7px] text-[13px] font-bold text-ink disabled:opacity-50">{busy ? "Uploading…" : "Save model"}</button>
      {message && <p role="status" className="mb-0 text-[12px] text-ink">{message}</p>}
    </form>
  </details>;
}
