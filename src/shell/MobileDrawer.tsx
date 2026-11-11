// A modal edge drawer for the phone layout: the filter panel slides in from the
// left and the school inspector rises as a bottom sheet. It replaces MUI's
// temporary Drawer with the same behavior: rendered in a portal over the app, a
// dimming backdrop that closes on click, Escape to close, focus moved into the
// panel on open (and Tab kept inside it) and returned to the opener on close,
// and an optional keepMounted so a panel keeps its state while hidden. Styles
// live in MobileDrawer.carbon.css. No em dashes in this file.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./MobileDrawer.carbon.css";

// Slide timings match the old drawer: enter 225ms (decelerate), exit 195ms (sharp).
const EXIT_MS = 195;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileDrawer({
  anchor,
  open,
  onClose,
  keepMounted = false,
  label,
  paperClassName,
  children,
}: {
  anchor: "left" | "bottom";
  open: boolean;
  onClose: () => void;
  keepMounted?: boolean;
  label: string;
  paperClassName?: string;
  children: ReactNode;
}) {
  // `present`: the drawer is in the DOM (open, or playing its exit). `shown`:
  // the open visual state, applied right after the closed position is laid out
  // so the enter slide plays.
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  // Enter: force a layout of the closed (off-screen) position, then switch to
  // the open state before paint, so the browser transitions between the two.
  // A reflow, not a requestAnimationFrame, so it never waits on frame timing.
  useLayoutEffect(() => {
    if (!open || !present) return;
    void paperRef.current?.offsetHeight;
    setShown(true);
  }, [open, present]);

  // Exit: slide out, then leave the DOM (or hide, when keepMounted).
  useEffect(() => {
    if (open) return;
    setShown(false);
    const t = setTimeout(() => setPresent(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Move focus into the panel on open; give it back to the opener on close.
  useEffect(() => {
    if (!open || !present) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    paperRef.current?.focus({ preventScroll: true });
    return () => {
      const el = returnFocus.current;
      if (el && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, [open, present]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab" || !paperRef.current) return;
    // Keep Tab inside the panel while it is open (a modal focus trap).
    const nodes = [...paperRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) { e.preventDefault(); paperRef.current.focus(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === paperRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  const mounted = present || keepMounted;
  if (!mounted) return null;
  const hidden = !present;

  return createPortal(
    <div
      className={`mdrawer mdrawer--${anchor}${shown ? " mdrawer--open" : ""}${hidden ? " mdrawer--hidden" : ""}`}
      aria-hidden={hidden || undefined}
      onKeyDown={onKeyDown}
    >
      <div className="mdrawer__backdrop" aria-hidden onClick={onClose} />
      <div
        ref={paperRef}
        className={`mdrawer__paper${paperClassName ? ` ${paperClassName}` : ""}`}
        role="dialog"
        aria-modal={open || undefined}
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
