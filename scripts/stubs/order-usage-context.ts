import type { Actor } from "../../src/lib/scope";
export { storyScope } from "../../src/lib/scope";

/** Only loaded by verify:order-usage's module hook. */
export async function currentUser(): Promise<Actor | null> {
  return Reflect.get(globalThis, "orderUsageTestActor") ?? null;
}
export async function requireUser() {
  const actor = await currentUser();
  if (!actor) throw new Error("Sign in first");
  return actor;
}
export async function requireAdmin() {
  const actor = await requireUser();
  if (actor.role !== "admin") throw new Error("Admin required");
  return actor;
}
export function redirect(location: string): never {
  throw Object.assign(new Error("Redirect"), { location });
}
export const printerName = async () => "Owner";
export const printerOwner = async () => null;
export const notify = async () => undefined;
export async function headers() { return new Headers(); }
export function revalidatePath(path: string) {
  (Reflect.get(globalThis, "orderUsageTestPaths") as string[]).push(path);
}
