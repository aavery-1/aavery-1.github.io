// The KIPP-branded access screen shown before the app when the Supabase gate is
// configured. The password is verified on Supabase's server (see supabaseClient);
// on success we remember it for the session so a refresh does not re-prompt.
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, PasswordInput } from "@carbon/react";
import { ArrowRight, Locked } from "@carbon/icons-react";
import { gateConfigured, checkAccess } from "./supabaseClient";
import "./PasswordGate.css";

const UNLOCK_KEY = "fft_unlocked";

function alreadyUnlocked(): boolean {
  try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; }
}

type Status = "idle" | "checking" | "wrong" | "error";

export function PasswordGate({ children }: { children: ReactNode }) {
  // Render the app immediately when the gate is off (local dev) or already
  // unlocked this browser session.
  const [unlocked, setUnlocked] = useState(() => !gateConfigured || alreadyUnlocked());
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  if (unlocked) return <>{children}</>;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw.trim() || status === "checking") return;
    setStatus("checking");
    try {
      const ok = await checkAccess(pw.trim());
      if (ok) {
        try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch { /* private mode: stay unlocked in memory only */ }
        setUnlocked(true);
      } else {
        setStatus("wrong");
      }
    } catch {
      setStatus("error");
    }
  };

  const invalid = status === "wrong" || status === "error";
  const invalidText = status === "error"
    ? "Could not check the password. Check your connection and try again."
    : "That password is not correct. Try again.";

  return (
    <div className="pwgate" role="dialog" aria-modal="true" aria-label="Password required">
      <form className="pwgate__card" onSubmit={onSubmit}>
        <img className="pwgate__logo" src="/kipp-team-family.jpg" alt="KIPP Team and Family" />
        <div className="pwgate__lockrow">
          <Locked size={16} />
          <span>Private tool</span>
        </div>
        <h1 className="pwgate__title">Florida Facilities Tool</h1>
        <p className="pwgate__sub">Enter the access password to continue.</p>
        <PasswordInput
          id="pwgate-password"
          className="pwgate__input"
          labelText="Access password"
          placeholder="Enter password"
          value={pw}
          invalid={invalid}
          invalidText={invalidText}
          onChange={(e) => { setPw((e.target as HTMLInputElement).value); if (invalid) setStatus("idle"); }}
          autoFocus
        />
        <Button type="submit" renderIcon={ArrowRight} disabled={status === "checking" || !pw.trim()} className="pwgate__submit">
          {status === "checking" ? "Checking..." : "Unlock"}
        </Button>
        <p className="pwgate__note">Access is limited to KIPP team members.</p>
      </form>
    </div>
  );
}
