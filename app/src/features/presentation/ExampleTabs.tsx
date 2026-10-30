import { Link } from "react-router-dom";
import { useT } from "../../i18n";

/**
 * The two views of one example: the testimony itself, and the same testimony read back
 * through the wizard's questions. They're separate pages rather than one long scroll —
 * watching a 45-minute recording and studying how a story gets built are different tasks,
 * and neither should make the other harder to find.
 */
export function ExampleTabs({
  videoId,
  active,
  storyAvailable,
}: {
  videoId: string;
  active: "testimony" | "story";
  storyAvailable: boolean;
}) {
  const t = useT();
  return (
    <div
      role="tablist"
      style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 22 }}
    >
      <Tab to={`/presentation/examples/${videoId}`} active={active === "testimony"}>
        {t("Watch the testimony")}
      </Tab>
      {storyAvailable && (
        <Tab to={`/presentation/examples/${videoId}/story`} active={active === "story"}>
          {t("How this becomes a story")}
        </Tab>
      )}
    </div>
  );
}

function Tab({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <Link
      to={to}
      role="tab"
      aria-selected={active}
      style={{
        padding: "10px 18px",
        fontSize: 14.5,
        fontWeight: 600,
        color: active ? "var(--accent-deep)" : "var(--ink-soft)",
        // Sits on top of the container's border so the active tab reads as joined to the page.
        borderBottom: `2px solid ${active ? "var(--accent-deep)" : "transparent"}`,
        marginBottom: -1,
      }}
    >
      {children}
    </Link>
  );
}
