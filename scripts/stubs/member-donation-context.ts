export async function headers() { return new Headers(); }
export function notFound(): never { throw new Error("Not found"); }
export function redirect(path: string): never { throw new Error(`Redirect: ${path}`); }

export function revalidatePath(path: string) {
  (Reflect.get(globalThis, "memberDonationTestPaths") as string[]).push(path);
}
