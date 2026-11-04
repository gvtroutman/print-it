import type { Actor } from "../../src/lib/scope";

export async function requireAdmin(): Promise<Actor> {
  const actor = Reflect.get(globalThis, "memberDonationTestActor") as Actor | null;
  if (actor?.role !== "admin") throw new Error("Admin required");
  return actor;
}

export async function requireUser(): Promise<Actor> {
  const actor = Reflect.get(globalThis, "memberDonationTestActor") as Actor | null;
  if (!actor) throw new Error("Sign-in required");
  return actor;
}
export async function startPreview() { throw new Error("Unexpected preview start"); }
export async function endPreview() { throw new Error("Unexpected preview end"); }
export async function requireFreshAuth() { throw new Error("Unexpected reauthentication"); }
