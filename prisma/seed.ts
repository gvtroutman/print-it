/**
 * Bootstraps the single admin — the printer owner.
 *
 * Written straight through Prisma: the owner is the one person who does not
 * pick their name on /hello. Their pages are unlocked with ADMIN_PASSWORD,
 * which lives in the environment rather than in this row.
 *
 * Idempotent: re-running it renames the existing owner rather than adding a
 * second one — the database refuses a second admin anyway.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Mirrors src/lib/tokens.ts. Duplicated so the seed runs without the app's
// module graph (and its "server-only" imports).
function initialsFor(name: string): string {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  if (!first) return "??";
  return [...first].slice(0, 2).join("").toUpperCase();
}

async function main() {
  const name = (process.env.ADMIN_NAME ?? "").trim();
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase() || null;

  if (!name) {
    throw new Error("Set ADMIN_NAME in .env before seeding — it names the printer owner.");
  }

  const existingAdmin = await db.user.findFirst({ where: { role: "admin" } });

  const admin = existingAdmin
    ? await db.user.update({
        where: { id: existingAdmin.id },
        data: { name, initials: initialsFor(name), ...(email ? { email } : {}) },
      })
    : await db.user.create({
        data: { name, email, initials: initialsFor(name), role: "admin" },
      });

  console.info(`Printer owner ready: ${admin.name}`);

  // The default benefits (tip options). Idempotent and non-destructive: an
  // upsert per label with an empty update, so a re-run (the migrator runs the
  // seed on every deploy) never overwrites the owner's edits — a renamed,
  // retired or preferred benefit is left exactly as they set it, and a retired
  // default is not resurrected. New default labels are appended.
  const DEFAULT_BENEFITS = [
    "A beer",
    "A coffee",
    "A spool of filament",
    "Nerd stuff",
    "Nothing, sorry",
  ];
  for (let i = 0; i < DEFAULT_BENEFITS.length; i++) {
    await db.benefit.upsert({
      where: { label: DEFAULT_BENEFITS[i]! },
      update: {},
      create: { label: DEFAULT_BENEFITS[i]!, sortOrder: i + 1 },
    });
  }
  console.info(`Benefits ready: ${DEFAULT_BENEFITS.length} default tip(s) present.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
