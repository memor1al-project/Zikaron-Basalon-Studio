import type { ReactNode } from "react";
import { AppLayout } from "../../app/AppLayout";
import { useAuth } from "../auth/useAuth";

/** Same shell as the Collection Wizard's pages — the Presentation Wizard is a separate tool, not a further Collection step. */
export function PresentationPageShell({
  children,
  /**
   * Caps the content column. The default suits reading; the Testimony Navigator passes
   * "full" so the video and its chapter list use the whole main area instead of sitting
   * in a 960px column with the rest of the screen empty around them.
   */
  width = "reading",
}: {
  children: ReactNode;
  width?: "reading" | "full";
}) {
  const isFull = width === "full";
  // The example stories are open to anyone, so this shell renders for signed-out visitors too.
  const { user } = useAuth();
  return (
    <AppLayout step="presentation" profileDone={true} signedIn={Boolean(user)}>
      {/* .wizard-page is the hook the print stylesheet uses — an example story prints to
          the same booklet as a family's own. */}
      <div
        className="wizard-page"
        style={{
          padding: isFull ? "28px 32px" : "48px 40px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div className="card-enter" style={{ width: "100%", maxWidth: isFull ? "none" : 960 }}>
          {children}
        </div>
      </div>
    </AppLayout>
  );
}
