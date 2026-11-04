import type { Actor } from "../../src/lib/scope";
export { storyRef } from "../../src/lib/scope";

/** Only loaded by verify:store-access's module hook. */
export async function currentUser(): Promise<Actor | null> {
  return (globalThis as unknown as { storeAccessTestActor: Actor | null }).storeAccessTestActor;
}
export const printerName = async () => "Owner";
export const printerOwner = async () => null;
export const notify = async () => undefined;
