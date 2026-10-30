import type { CSSProperties, ReactNode } from "react";

/**
 * A button that shows it's working without rewriting itself.
 *
 * The label never changes: a button that says "Summarize" before the click and
 * "Summarizing..." after it is a different button as far as the eye is concerned, and on a
 * row of four it's genuinely hard to tell which one was pressed. Instead the label stays
 * put and a spinner appears in a slot that is always there — reserved even when idle — so
 * nothing on the row shifts sideways at the moment of the click.
 *
 * Progress worth reading ("Extracting audio from video...") belongs on its own line under
 * the row, where it has space to say something useful and can change as often as it likes.
 */
export function ActionButton({
  busy = false,
  disabled = false,
  onClick,
  title,
  className = "btn-secondary",
  style,
  children,
}: {
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      // Pressing a button that's already running would start the work twice.
      disabled={disabled || busy}
      onClick={onClick}
      title={title}
      aria-busy={busy || undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, ...style }}
    >
      <span
        aria-hidden
        style={{
          width: 13,
          height: 13,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {busy && <span className="spinner" style={{ width: 13, height: 13 }} />}
      </span>
      {children}
    </button>
  );
}
