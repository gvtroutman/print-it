import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { Actor } from "../src/lib/scope";

const owner: Actor = { id: "owner", name: "Owner", email: "owner@example.test", initials: "OW", role: "admin", canAddDevice: true, canAddMember: true };
const member: Actor = { ...owner, id: "member", name: "Member", role: "client" };
const target = { ...member, hasDonated: false };
const ownerTarget = { ...owner, hasDonated: false };
let writes = 0;
const events: Array<{ action: string; detail: { hasDonated: boolean; userId: string } }> = [];
const paths: string[] = [];
Reflect.set(globalThis, "memberDonationTestPaths", paths);
Reflect.set(globalThis, "prisma", {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => where.id === target.id ? target : where.id === owner.id ? ownerTarget : null,
    update: async ({ where, data }: { where: { id: string }; data: { hasDonated: boolean } }) => {
      const selected = where.id === target.id ? target : ownerTarget;
      assert.equal(where.id, selected.id);
      selected.hasDonated = data.hasDonated;
      writes++;
      return selected;
    },
  },
  auditEvent: { create: async ({ data }: { data: typeof events[number] }) => { events.push(data); } },
});
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const path = new URL(resolved.url).pathname;
    if (path.endsWith("/src/lib/authz.ts") || path.endsWith("/src/lib/reauth.ts")) {
      return { ...resolved, url: new URL("./stubs/member-donation-authz.ts", import.meta.url).href };
    }
    if (["next/cache", "next/headers", "next/navigation"].includes(specifier)) {
      return { ...resolved, url: new URL("./stubs/member-donation-context.ts", import.meta.url).href };
    }
    return resolved;
  },
});
const { setMemberDonationAction } = await import("../src/app/admin/invites/actions");
const { setPreviewDonationAction } = await import("../src/app/actions/preview");
const { hasStoreAccess } = await import("../src/lib/store-access");
const form = (userId = member.id, hasDonated = "true") => {
  const data = new FormData();
  data.set("userId", userId);
  data.set("hasDonated", hasDonated);
  return data;
};

for (const actor of [null, member, { ...owner, role: "client", previewing: true }]) {
  Reflect.set(globalThis, "memberDonationTestActor", actor);
  await assert.rejects(setMemberDonationAction(form()), /Admin required/);
}
assert.equal(writes, 0, "Members, member previews and signed-out requests cannot change donation status");
Reflect.set(globalThis, "memberDonationTestActor", owner);
for (const payload of [form(""), form("missing"), form(owner.id), form(member.id, "yes"), new FormData()]) {
  assert.ok((await setMemberDonationAction(payload)).error, "Invalid values, missing members and the owner must be refused");
}
assert.equal(writes, 0, "Refused requests must not write anything");
assert.deepEqual(await setMemberDonationAction(form()), { hasDonated: true });
assert.equal(await hasStoreAccess(member), true, "Ticking Donated unlocks Store for an existing session without a payment entry");
assert.deepEqual(await setMemberDonationAction(form(member.id, "false")), { hasDonated: false });
assert.equal(await hasStoreAccess(member), false, "Unticking Donated revokes Store access for that same session");
assert.equal(events.length, 2);
assert.deepEqual(events.map(event => [event.action, event.detail.userId, event.detail.hasDonated]), [
  ["donation.member_status_changed", member.id, true],
  ["donation.member_status_changed", member.id, false],
]);
for (const path of ["/admin/invites", "/bin", "/upload", "/story"]) {
  assert.equal(paths.filter(value => value === path).length, 2, `${path} must refresh in both directions`);
}

for (const actor of [null, member, owner, { ...member, previewing: true }]) {
  Reflect.set(globalThis, "memberDonationTestActor", actor);
  await assert.rejects(setPreviewDonationAction(form()), /Sign-in required|Not found/);
}
assert.equal(writes, 2, "Only the real owner in Member view can change preview donation status");
const preview: Actor = { ...owner, role: "client", previewing: true };
Reflect.set(globalThis, "memberDonationTestActor", preview);
assert.ok((await setPreviewDonationAction(form(owner.id, "yes"))).error);
assert.equal(writes, 2, "An invalid preview value must not write anything");
// A forged member id is ignored: the preview control changes the owner only.
assert.deepEqual(await setPreviewDonationAction(form(member.id)), { hasDonated: true });
assert.equal(await hasStoreAccess(preview), true, "The donated preview can access Store");
assert.equal(target.hasDonated, false, "The preview must not change a real member's donation status");
assert.deepEqual(await setPreviewDonationAction(form(member.id, "false")), { hasDonated: false });
assert.equal(await hasStoreAccess(preview), false, "Unticking the preview donation checkbox locks Store again");
assert.equal(await hasStoreAccess(owner), true, "Owner view still manages Store in either preview donation state");
assert.equal(paths.filter(value => value === "/member").length, 2, "The Member page refreshes after each preview change");
assert.deepEqual(events.slice(2).map(event => [event.action, event.detail.userId, event.detail.hasDonated]), [
  ["donation.member_status_changed", owner.id, true],
  ["donation.member_status_changed", owner.id, false],
]);
console.log("Member donation checks passed: admin-only writes, saved checkbox state, Store access and revocation, audit events, page refreshes and isolated owner donation preview.");
