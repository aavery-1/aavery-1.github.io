// Small shared UI primitives from 02_DESIGN_SYSTEM.md: floating card, button,
// chip, toggle, empty state. Kept together because each is a handful of lines.

import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Icon } from "./icons";

export function Card({
  title,
  badge,
  onClose,
  children,
  className,
  width,
}: {
  title?: ReactNode;
  badge?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  return (
    <div className={`card ${className ?? ""}`} style={width ? { width } : undefined} role="group">
      {(title || onClose) && (
        <div className="card-header">
          <div className="card-title">
            {title}
            {badge}
          </div>
          {onClose && (
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon.Close size={16} />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "default",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  return (
    <button className={`btn btn-${variant}`} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  label,
  selected,
  onClick,
  swatch,
  disabled,
  title,
}: {
  label: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  swatch?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      className={`chip ${selected ? "chip-selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
    >
      {swatch && <span className="chip-swatch" style={{ background: swatch }} aria-hidden />}
      {label}
    </button>
  );
}

// Presentational toggle. The clickable target is the parent row button, so this
// element is aria-hidden to avoid a duplicate switch role in the tab order.
export function Toggle({ checked, id, label }: { checked: boolean; id: string; label: string }) {
  return (
    <span className={`toggle ${checked ? "toggle-on" : ""}`} id={id} aria-hidden title={label}>
      <span className="toggle-knob" />
    </span>
  );
}

export function EmptyState({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden>
        {icon ?? <Icon.Info size={16} />}
      </span>
      <span className="empty-text">{children}</span>
      {action}
    </div>
  );
}
