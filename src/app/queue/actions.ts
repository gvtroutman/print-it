"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { record } from "@/lib/audit";
import { BambuError, bambuLink, connect, disconnect, sendCode, syncPrints } from "@/lib/bambu";

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
});

function back(kind: "toast" | "error", message: string): never {
  redirect(`/queue?${kind}=${encodeURIComponent(message)}`);
}

export async function logHoursAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = Reading.safeParse({
    printerId: formData.get("printerId") ?? "",
    hours: formData.get("hours") ?? "",
  });
  if (!parsed.success) back("error", "Hours should be a number, like 412.5.");

  const { printerId } = parsed.data;
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

  await db.printerReading.create({ data: { printerId, hours } });
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

/**
 * Connecting Bambu Lab, in two plain forms: an email, then the code Bambu
 * sends to it. The email waits in a short-lived cookie between the two, so it
 * stays out of the URL.
 */

const PENDING_COOKIE = "ppp_bambu_email";

const Email = z.string().trim().toLowerCase().email().max(200);
const Code = z.string().trim().regex(/^\d{4,8}$/);

export async function bambuSendCodeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = Email.safeParse(formData.get("email") ?? "");
  if (!parsed.success) back("error", "That doesn't look like an email address.");

  try {
    await sendCode(parsed.data);
  } catch (error) {
    back("error", error instanceof BambuError ? error.message : "Bambu Lab did not send a code.");
  }
  (await cookies()).set(PENDING_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/queue",
    maxAge: 15 * 60,
  });
  back("toast", `Bambu Lab emailed a code to ${parsed.data}.`);
}

export async function bambuConnectAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const jar = await cookies();
  const email = jar.get(PENDING_COOKIE)?.value;
  if (!email) back("error", "The code timed out. Ask Bambu Lab for a new one.");
  const code = Code.safeParse(formData.get("code") ?? "");
  if (!code.success) back("error", "The code is the digits from Bambu's email.");

  try {
    await connect(email, code.data);
  } catch (error) {
    back("error", error instanceof BambuError ? error.message : "Bambu Lab did not take that code.");
  }
  jar.delete({ name: PENDING_COOKIE, path: "/queue" });
  await record({ action: "printer.bambu_connected", actor: admin, subject: email });

  const result = await syncPrints();
  revalidatePath("/queue");
  back(result.ok ? "toast" : "error", result.ok ? `Bambu Lab connected. ${result.message}` : result.message);
}

export async function bambuCancelAction(): Promise<void> {
  await requireAdmin();
  (await cookies()).delete({ name: PENDING_COOKIE, path: "/queue" });
  redirect("/queue");
}

export async function bambuSyncAction(): Promise<void> {
  await requireAdmin();
  const result = await syncPrints();
  revalidatePath("/queue");
  back(result.ok ? "toast" : "error", result.message);
}

export async function bambuDisconnectAction(): Promise<void> {
  const admin = await requireAdmin();
  const link = await bambuLink();
  await disconnect();
  await record({ action: "printer.bambu_disconnected", actor: admin, subject: link?.email ?? null });
  revalidatePath("/queue");
  back("toast", "Bambu Lab disconnected. The prints already synced stay.");
}
