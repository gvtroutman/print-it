"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { record } from "@/lib/audit";

/**
 * Logging a printer's hour meter from the owner's home. A plain form, so it
 * works with JavaScript off; the outcome comes back as a toast or an error.
 */

const Reading = z.object({
  printerId: z.string().min(1),
  // "1,234.5" is how some screens show it; take it either way.
  hours: z
    .string()
    .transform((value) => Number(value.replace(/[,\s]/g, "")))
    .pipe(z.number().finite().min(0).max(100_000)),
  note: z.string().trim().max(80).default(""),
});

function back(kind: "toast" | "error", message: string): never {
  redirect(`/queue?${kind}=${encodeURIComponent(message)}`);
}

export async function logHoursAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = Reading.safeParse({
    printerId: formData.get("printerId") ?? "",
    hours: formData.get("hours") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) back("error", "Hours should be a number, like 412.5.");

  const { printerId, note } = parsed.data;
  const hours = Math.round(parsed.data.hours * 10) / 10;

  const printer = await db.printer.findUnique({
    where: { id: printerId },
    include: { readings: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!printer) back("error", "That printer is gone.");

  const last = printer.readings[0];
  if (last && hours < last.hours) {
    back("error", `The meter only goes up. The last reading was ${last.hours} h.`);
  }

  await db.printerReading.create({ data: { printerId, hours, note } });
  await record({
    action: "printer.hours_logged",
    actor: admin,
    subject: printer.name,
    detail: { hours, previous: last?.hours ?? null },
  });
  revalidatePath("/queue");

  const gained = last ? hours - last.hours : 0;
  back(
    "toast",
    last && gained > 0
      ? `${printer.name}: ${hours} h (+${gained.toFixed(1)} h)`
      : `${printer.name}: ${hours} h logged`,
  );
}
