"use client";

import { authClient } from "@/lib/auth-client";

export function SignOut({ role, previewing }: { role: "client" | "admin"; previewing?: boolean }) {
  return (
    <button
      type="button"
      onClick={async () => {
        // Members need a fresh owner-issued link after signing this device out.
        if (
          role === "client" && !previewing &&
          !window.confirm("Sign this device out? You will need a new link from the printer owner to get back in.")
        ) return;
        await authClient.signOut();
        window.location.assign("/signin");
      }}
      className="stamp cursor-pointer rounded-chip border-[3px] border-ink bg-cream-2 px-[17.6px] py-[9px] text-[14px] font-bold text-ink hover:bg-cherry-wash"
    >
      Sign out
    </button>
  );
}
