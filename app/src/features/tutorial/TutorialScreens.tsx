import type { ReactNode } from "react";

/**
 * The mock screens used throughout the tutorial.
 *
 * Drawn from the app's own tokens at about two-thirds scale rather than captured as
 * images: a screenshot goes stale the moment a label changes, and nobody notices until a
 * reader is looking at a picture of something that is no longer there. These are built
 * out of the same CSS variables as the interface, so a change to the palette or the rail
 * carries through here too.
 *
 * Content only — every style lives in index.css under .tut-*.
 */

export interface RailStep {
  label: string;
  state?: "done" | "now";
  sub?: string;
}

export function Shot({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <>
      <div className="tut-shot">{children}</div>
      <p className="tut-cap">{caption}</p>
    </>
  );
}

export function MockApp({
  steps,
  children,
  minHeight,
  banner,
  railFoot,
  dim,
}: {
  steps: RailStep[];
  children: ReactNode;
  minHeight?: number;
  banner?: string;
  railFoot?: ReactNode;
  dim?: boolean;
}) {
  return (
    <>
      {banner && <div className="tut-topbar">{banner}</div>}
      <div className="tut-app" style={minHeight ? { minHeight } : undefined}>
        <div className="tut-rail">
          <div className="tut-logo">
            <b>זיכרון בסלון</b>
            <span>STORY STUDIO</span>
          </div>
          {steps.map((step) => (
            <div
              key={step.label}
              className={`tut-step${step.state === "done" ? " is-done" : ""}${step.state === "now" ? " is-now" : ""}`}
            >
              <span className="tut-dot" />
              <span>
                {step.label}
                {step.sub && <i>{step.sub}</i>}
              </span>
            </div>
          ))}
          {railFoot && <div className="tut-railfoot">{railFoot}</div>}
        </div>
        <div className={`tut-canvas${dim ? " is-dim" : ""}`}>{children}</div>
      </div>
    </>
  );
}

export function Face({ initial, name, on }: { initial: string; name: string; on?: boolean }) {
  return (
    <div className={`tut-face${on ? " is-on" : ""}`}>
      <div className="tut-ring">{initial}</div>
      {name}
    </div>
  );
}

export function Node({ initial, name, subject }: { initial: string; name: string; subject?: boolean }) {
  return (
    <div className={`tut-node${subject ? " is-subject" : ""}`}>
      <div className="tut-ring">{initial}</div>
      {name}
    </div>
  );
}

export function Tile({ glyph, name, tag, sage }: { glyph: string; name: string; tag: string; sage?: boolean }) {
  return (
    <div className="tut-tile">
      <div className="tut-thumb">{glyph}</div>
      <div className="tut-name">{name}</div>
      <span className={`tut-tag${sage ? " is-sage" : ""}`}>{tag}</span>
    </div>
  );
}

export function Chapter({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <>
      <div className="tut-chapter" id={`ch${n}`}>
        <span className="tut-num">{n}</span>
        <h2>{title}</h2>
      </div>
      {sub && <p className="tut-sub">{sub}</p>}
    </>
  );
}

export function Note({ children, sage }: { children: ReactNode; sage?: boolean }) {
  return <div className={`tut-note${sage ? " is-sage" : ""}`}>{children}</div>;
}
