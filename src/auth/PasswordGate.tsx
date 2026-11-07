// The KIPP-branded access screen shown before the app. The password is checked on
// Supabase's server (see access.ts), which returns a session token; the token is
// what unlocks the private data, so setting a browser flag by hand gets nothing.
// On a refresh the saved token is re-checked silently; the load splash stays up
// meanwhile, so a returning user never sees the password screen flash.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, PasswordInput } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { AccessError, resumeSession, unlock, type PrivateData } from "./access";
import { setKippRequestedMsids } from "../data/derive/sohSites";
import "./PasswordGate.css";

type Phase = "resuming" | "locked" | "unlocked";
type Status = "idle" | "checking" | "wrong" | "rate-limited" | "error";

// Install private values into the app's registries BEFORE the app renders, so
// every map layer and label computes with them from the first frame.
function applyPrivateData(data: PrivateData) {
  setKippRequestedMsids(Array.isArray(data.kipp_requested_msids) ? data.kipp_requested_msids : []);
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("resuming");
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    let live = true;
    resumeSession()
      .then((data) => {
        if (!live) return;
        if (data) { applyPrivateData(data); setPhase("unlocked"); }
        else setPhase("locked");
      })
      .catch(() => { if (live) setPhase("locked"); });
    return () => { live = false; };
  }, []);

  if (phase === "unlocked") return <>{children}</>;
  if (phase === "resuming") return null; // the index.html splash covers this beat

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw.trim() || status === "checking") return;
    setStatus("checking");
    try {
      const data = await unlock(pw.trim());
      if (data) {
        applyPrivateData(data);
        setPhase("unlocked");
      } else {
        setStatus("wrong");
      }
    } catch (err) {
      setStatus(err instanceof AccessError && err.kind === "rate-limited" ? "rate-limited" : "error");
    }
  };

  const invalid = status === "wrong" || status === "error" || status === "rate-limited";
  const invalidText =
    status === "rate-limited" ? "Too many attempts. Wait 15 minutes and try again."
    : status === "error" ? "Could not check the password. Check your connection and try again."
    : "That password is not correct. Try again.";

  return (
    <div className="pwgate" role="dialog" aria-modal="true" aria-label="Password required">
      <form className="pwgate__card" onSubmit={onSubmit}>
        <img className="pwgate__logo" src="/kipp-team-family.jpg" alt="KIPP Team and Family" />
        <h1 className="pwgate__title">Florida Facilities Tool</h1>
        <p className="pwgate__sub">Enter the access password to continue.</p>
        <PasswordInput
          id="pwgate-password"
          className="pwgate__input"
          labelText="Password"
          hideLabel
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
      </form>
    </div>
  );
}
