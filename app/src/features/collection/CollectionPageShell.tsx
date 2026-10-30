import type { ReactNode } from "react";
import { AppLayout } from "../../app/AppLayout";
import type { FlowStep } from "../../app/AppSidebar";

export function CollectionPageShell({
  step,
  children,
  /** Wider than the reading column for steps that lay out sideways, like the family chart. */
  maxWidth = 780,
}: {
  step: FlowStep;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    // Reaching any /collection/* route already required a saved profile (RequireProfile).
    <AppLayout step={step} profileDone={true}>
      {/* .wizard-page is the hook the print stylesheet uses to turn this centred
          column into the printed sheet. */}
      <div className="wizard-page" style={{ padding: "48px 40px", display: "flex", justifyContent: "center" }}>
        <div className="card-enter" style={{ width: "100%", maxWidth }}>
          {children}
        </div>
      </div>
    </AppLayout>
  );
}
