import { Link, useNavigate } from "react-router-dom";
import { useCollectionSessionOptional } from "../features/collection/CollectionSessionContext";
import { signOutUser } from "../features/auth/useAuth";
import { VersionBadge } from "./VersionBadge";
import { LanguageSwitch } from "./LanguageSwitch";
import { useT } from "../i18n";

export type FlowStep =
  | "registration"
  | "storage"
  | "collection"
  | "familytree"
  | "interview"
  | "summary"
  | "presentation"
  | "catalog"
  | "resources"
  | "tutorial";

interface StepDef {
  key: FlowStep;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const stepDefs: StepDef[] = [
  { key: "registration", label: "Registration", path: "/profile", icon: <RegistrationIcon /> },
  { key: "storage", label: "Storage", path: "/collection/connect", icon: <StorageIcon /> },
  { key: "collection", label: "Collection", path: "/collection/materials", icon: <CollectionIcon /> },
  { key: "familytree", label: "Family tree", path: "/collection/familytree", icon: <FamilyTreeIcon /> },
  { key: "interview", label: "Story", path: "/collection/story", icon: <StoryIcon /> },
  { key: "summary", label: "Summary", path: "/collection/summary", icon: <SummaryIcon /> },
];

interface AppSidebarProps {
  current: FlowStep;
  profileDone: boolean;
  /**
   * False for a visitor browsing the example stories without an account. The wizard steps
   * are hidden rather than shown-and-broken: every one of them would bounce to sign-in.
   */
  signedIn?: boolean;
}

/** Left tree-like nav: shows every step, what's already filled in, and lets you jump back/forward. */
export function AppSidebar({ current, profileDone, signedIn = true }: AppSidebarProps) {
  // null outside the Collection Wizard (e.g. on Presentation Wizard pages, which have no CollectionSessionProvider).
  const session = useCollectionSessionOptional();
  const t = useT();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOutUser().catch(() => {});
    // Back to the part of the Studio that needs no account, rather than a dead guarded page.
    navigate("/presentation/examples", { replace: true });
  }

  const connection = session?.connection ?? null;
  const persistedStory = session?.persistedStory ?? null;

  const storageLabel = connection?.label ?? (persistedStory && persistedStory !== "loading" ? persistedStory.storageLabel : null);
  const storageDone = Boolean(storageLabel);
  const fileCount = connection?.label
    ? undefined // live count is shown by MaterialsStep itself; sidebar only needs "connected or not" here
    : persistedStory && persistedStory !== "loading"
      ? persistedStory.fileCount
      : undefined;
  // The live connection is empty until the folder is re-picked this session (browsers
  // don't silently restore File System Access permission), so the provider remembered
  // from Firestore is what decides whether this story even has a local sidecar to show.
  const storageProviderId =
    connection?.providerId ?? (persistedStory && persistedStory !== "loading" ? persistedStory.storageProvider : null);

  const reached: Record<FlowStep, boolean> = {
    registration: true,
    storage: profileDone,
    collection: storageDone,
    // Needs only a profile, not a connected folder: the tree is typed in or imported from
    // a .ged and lives entirely in Firestore, so gating it on storage would lock people
    // out of the one step that never touches their materials.
    familytree: profileDone,
    interview: storageDone,
    summary: storageDone,
    presentation: true,
    catalog: true,
    resources: true,
    tutorial: true,
  };

  const subtext: Partial<Record<FlowStep, string>> = {
    storage: storageLabel ?? undefined,
    collection: fileCount !== undefined ? `${fileCount} ${t("files")}` : undefined,
    // The one step nobody has to complete — said here so it isn't mistaken for
    // something left unfinished.
    familytree: t("Optional"),
  };

  return (
    <aside
      style={{
        width: "var(--rail-width)",
        flexShrink: 0,
        /* A shade deeper than the page cream, so the rail reads as a distinct
           surface next to the photo-backed content panel. */
        background: "var(--bg-cream-2)",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        padding: "22px 0",
      }}
    >
      <Link
        to={signedIn ? "/profile" : "/presentation/examples"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          color: "inherit",
          padding: "0 20px",
          marginBottom: 8,
        }}
      >
        <LogoMark />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontFamily: "Domine, serif", fontSize: 16, fontWeight: 600 }}>{t("Zikaron BaSalon")}</span>
          <span style={{ fontSize: 9.5, letterSpacing: ".06em", color: "var(--ink-soft)", textTransform: "uppercase" }}>
            {t("Story Studio")}
          </span>
        </div>
      </Link>

      <a
        href="https://www.zikaronbasalon.com/"
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 11, color: "var(--ink-soft)", padding: "0 20px", marginBottom: 24 }}
      >
        zikaronbasalon.com ↗
      </a>

      <nav style={{ display: "flex", flexDirection: "column", padding: "0 12px" }}>
        {(signedIn ? stepDefs : []).map((step, i) => {
          const done = reached[step.key] && step.key !== current && i < stepDefs.findIndex((s) => s.key === current);
          const active = step.key === current;
          const clickable = reached[step.key] && !active;
          const isLast = i === stepDefs.length - 1;

          const row = (
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "10px 10px",
                borderRadius: 10,
                background: active ? "var(--accent-soft)" : "transparent",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: active || done ? "var(--accent-deep)" : "var(--bg-cream-2)",
                    color: active || done ? "var(--bg-cream)" : "var(--ink-soft)",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  {done ? <CheckGlyph /> : step.icon}
                </span>
                {!isLast && (
                  <span
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 20,
                      marginTop: 4,
                      background: done ? "var(--accent-deep)" : "var(--line)",
                    }}
                  />
                )}
              </div>
              <div style={{ paddingTop: 4, paddingBottom: 14 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--ink)" : reached[step.key] ? "var(--ink-soft)" : "var(--line)",
                  }}
                >
                  {t(step.label)}
                </div>
                {subtext[step.key] && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-soft)",
                      marginTop: 2,
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {subtext[step.key]}
                  </div>
                )}
              </div>
            </div>
          );

          return clickable ? (
            <Link key={step.key} to={step.path} style={{ color: "inherit" }}>
              {row}
            </Link>
          ) : (
            <div key={step.key}>{row}</div>
          );
        })}
      </nav>

      <div style={{ padding: "0 12px", marginTop: 8 }}>
        <div style={{ height: 1, background: "var(--line)", margin: "4px 8px 14px" }} />
        <Link to="/presentation/examples" style={{ color: "inherit" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 10px",
              borderRadius: 10,
              background: current === "presentation" ? "var(--accent-soft)" : "transparent",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: current === "presentation" ? "var(--accent-deep)" : "var(--bg-cream-2)",
                color: current === "presentation" ? "var(--bg-cream)" : "var(--ink-soft)",
              }}
            >
              <PresentationIcon />
            </span>
            <div style={{ paddingTop: 4 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: current === "presentation" ? 700 : 500,
                  color: current === "presentation" ? "var(--ink)" : "var(--ink-soft)",
                }}
              >
                {t("Presentation")}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>{t("Example stories")}</div>
            <Link
              to="/presentation/conversation"
              style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2, display: "block" }}
              onClick={(e) => e.stopPropagation()}
            >
              {t("The conversation")}
            </Link>
            </div>
          </div>
        </Link>

        <Link to="/tutorial" style={{ color: "inherit" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 10px",
              borderRadius: 10,
              background: current === "tutorial" ? "var(--accent-soft)" : "transparent",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: current === "tutorial" ? "var(--accent-deep)" : "var(--bg-cream-2)",
                color: current === "tutorial" ? "var(--bg-cream)" : "var(--ink-soft)",
              }}
            >
              <TutorialIcon />
            </span>
            <div style={{ paddingTop: 4 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: current === "tutorial" ? 700 : 500,
                  color: current === "tutorial" ? "var(--ink)" : "var(--ink-soft)",
                }}
              >
                {t("How to use the Studio")}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                {t("A walkthrough, start to finish")}
              </div>
            </div>
          </div>
        </Link>

        <Link to="/resources" style={{ color: "inherit" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 10px",
              borderRadius: 10,
              background: current === "resources" ? "var(--accent-soft)" : "transparent",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: current === "resources" ? "var(--accent-deep)" : "var(--bg-cream-2)",
                color: current === "resources" ? "var(--bg-cream)" : "var(--ink-soft)",
              }}
            >
              <ResourcesIcon />
            </span>
            <div style={{ paddingTop: 4 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: current === "resources" ? 700 : 500,
                  color: current === "resources" ? "var(--ink)" : "var(--ink-soft)",
                }}
              >
                {t("Guides and materials")}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                {t("Kits to download")}
              </div>
            </div>
          </div>
        </Link>

        {signedIn && storageProviderId === "local" && (
          <Link to="/collection/catalog" style={{ color: "inherit" }}>
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "10px 10px",
                borderRadius: 10,
                background: current === "catalog" ? "var(--accent-soft)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: current === "catalog" ? "var(--accent-deep)" : "var(--bg-cream-2)",
                  color: current === "catalog" ? "var(--bg-cream)" : "var(--ink-soft)",
                }}
              >
                <CatalogIcon />
              </span>
              <div style={{ paddingTop: 4 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: current === "catalog" ? 700 : 500,
                    color: current === "catalog" ? "var(--ink)" : "var(--ink-soft)",
                  }}
                >
                  {t("Catalog")}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>{t("Local database")}</div>
              </div>
            </div>
          </Link>
        )}

        {signedIn && (
          <div style={{ marginTop: 18, padding: "0 10px" }}>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="btn-secondary"
              style={{ display: "inline-flex", fontSize: 12.5, padding: "8px 14px" }}
            >
              {t("Sign out")}
            </button>
          </div>
        )}

        {!signedIn && (
          <div style={{ marginTop: 18, padding: "0 10px" }}>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: 10 }}>
              {t("You're browsing the example stories. Sign in to build one of your own.")}
            </p>
            <Link
              to="/sign-in"
              className="btn-secondary"
              style={{ display: "inline-flex", fontSize: 12.5, padding: "8px 14px" }}
            >
              {t("Sign in")}
            </Link>
          </div>
        )}
      </div>

      <div style={{ marginTop: "auto", padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        <LanguageSwitch />
        <VersionBadge />
      </div>
    </aside>
  );
}

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M3 11.5L12 4l9 7.5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 8.3c1 1.1 1.5 1.9 1.5 2.9a1.5 1.5 0 1 1-3 0c0-1 .5-1.8 1.5-2.9z" fill="var(--accent)" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function RegistrationIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.5 4-5.5 7-5.5s5.8 2 7 5.5" />
    </svg>
  );
}

function StorageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H9l2 2h7.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10z" />
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 16l5-4.5 3.5 3 3-2.5L21 16" />
    </svg>
  );
}

function FamilyTreeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.4" />
      <circle cx="6" cy="18.5" r="2.4" />
      <circle cx="18" cy="18.5" r="2.4" />
      <path d="M12 7.4v4.2M6 16.1v-2.3a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v2.3" />
    </svg>
  );
}

function StoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13z" />
    </svg>
  );
}

function PresentationIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16.5V20" />
      <path d="M8 8.5l3 2.5-3 2.5" />
    </svg>
  );
}

function TutorialIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4" />
      <path d="M12 16.6v.01" />
    </svg>
  );
}

function ResourcesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A2.5 2.5 0 0 1 12 6.5v12A2 2 0 0 0 10 17H5.5A1.5 1.5 0 0 1 4 15.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4h-4A2.5 2.5 0 0 0 12 6.5v12A2 2 0 0 1 14 17h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7.5" ry="2.8" />
      <path d="M4.5 6v12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8V6" />
      <path d="M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5 5.5-6" />
    </svg>
  );
}
