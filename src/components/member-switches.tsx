import { setMemberPermissionAction } from "@/app/admin/invites/actions";

const SWITCHES = [
  { key: "canAddDevice", label: "Add device", what: "sign another of their own devices in" },
  { key: "canAddMember", label: "Add member", what: "invite somebody" },
] as const;

/**
 * Two things a member may do for themselves, switched on and off per member.
 *
 * The same stamp as the owner's view switch in the account menu: raised when
 * it is off, pressed in while it is on. Each is a plain server-action form so
 * it works before hydration, and `aria-pressed` carries the state for a
 * screen reader. When one is on, the matching entry appears in that member's
 * account menu; off, and it is gone again — nothing they already did is undone.
 */
export function MemberSwitches({
  userId,
  name,
  canAddDevice,
  canAddMember,
}: {
  userId: string;
  name: string;
  canAddDevice: boolean;
  canAddMember: boolean;
}) {
  const state = { canAddDevice, canAddMember };
  return (
    <div
      role="group"
      aria-label={`What ${name} may do`}
      className="flex flex-wrap items-center gap-[8.8px]"
    >
      {SWITCHES.map((s) => {
        const on = state[s.key];
        return (
          <form key={s.key} action={setMemberPermissionAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="permission" value={s.key} />
            <input type="hidden" name="on" value={on ? "false" : "true"} />
            <button
              type="submit"
              aria-pressed={on}
              title={on ? `${name} can ${s.what}. Switch it off` : `Let ${name} ${s.what}`}
              className={`stamp cursor-pointer rounded-chip border-[3px] border-ink px-[13.2px] py-[6px] font-mono text-[11.5px] font-bold uppercase text-ink ${
                on ? "stamp-pressed bg-sun" : "bg-cream-2 hover:bg-sun"
              }`}
            >
              {s.label}
              <span className="sr-only">{on ? ", on" : ", off"}</span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
