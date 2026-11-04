"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { REMEMBER_DEVICE_HEADER } from "@/lib/auth-rules";
import { Button, Input, Label, Notice } from "@/components/ui";

/**
 * One message for every way a sign-in can fail.
 *
 * Distinguishing "no such username" from "wrong password" turns this form
 * into a membership oracle for the office, and there is nothing the person at
 * the keyboard can do with the difference anyway.
 */
const REFUSED = "That username and password do not match. Try again.";

export function SignInForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  // Passkey autofill can wait while the checkbox changes. The verification
  // request reads these headers at completion, so it uses the current choice.
  const rememberHeaders = useRef(new Headers({ [REMEMBER_DEVICE_HEADER]: "true" }));

  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return;
    setPasskeySupported(true);

    // Conditional UI: if the browser already holds a passkey for this site it
    // offers it straight from the username field, with no click at all.
    // Browsers without support simply never resolve this, which is why it is
    // fire and forget.
    let active = true;
    void authClient.signIn.passkey({
      autoFill: true,
      fetchOptions: { headers: rememberHeaders.current },
    }).then((res) => {
      if (active && res && !res.error) window.location.assign(next);
    });
    return () => { active = false; };
  }, [next]);

  async function signInWithPasskey() {
    setError(null);
    const res = await authClient.signIn.passkey({
      fetchOptions: { headers: rememberHeaders.current },
    });
    if (res?.error) {
      setError(
        res.error.message ??
          "That passkey was not accepted. Use your password instead.",
      );
      return;
    }
    window.location.assign(next);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { error } = await authClient.signIn.username({
      username: username.trim().toLowerCase(),
      password,
      fetchOptions: { headers: rememberHeaders.current },
    });

    if (error) {
      setBusy(false);
      // 429 is worth saying out loud: "wrong password" would send someone
      // hunting for a typo that is not there.
      setError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : REFUSED,
      );
      return;
    }
    window.location.assign(next);
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <form onSubmit={signInWithPassword} className="flex flex-col gap-[13.2px]">
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            required
            // "webauthn" is what lets conditional UI offer a passkey from this
            // field before a single character is typed.
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ayla"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="flex cursor-pointer items-center gap-[9px] text-[14px] font-semibold text-ink">
            <input
              type="checkbox"
              name="rememberDevice"
              checked={rememberDevice}
              disabled={busy}
              onChange={(e) => {
                setRememberDevice(e.target.checked);
                rememberHeaders.current.set(REMEMBER_DEVICE_HEADER, String(e.target.checked));
              }}
              aria-describedby="remember-device-hint"
              className="h-[18px] w-[18px] accent-ink"
            />
            Remember this device
          </label>
          <p id="remember-device-hint" className="m-0 mt-[5px] text-[13px] leading-[1.5] text-ink-3">
            Stay signed in for 90 days. Uncheck on a shared computer.
          </p>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Checking…" : "Sign in"}
        </Button>
        {/* A quiet link, not a second big button: the username field already
            offers a saved passkey on its own (conditional UI above). */}
        {passkeySupported && (
          <button
            type="button"
            onClick={signInWithPasskey}
            className="cursor-pointer self-center bg-transparent text-[14px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            Use a passkey instead
          </button>
        )}
      </form>

      {error && <Notice tone="warn">{error}</Notice>}

      <p className="m-0 text-center text-[13.5px] leading-[1.5] text-ink-3">
        No account, or forgot your password? Ask the printer owner.
      </p>
    </div>
  );
}
