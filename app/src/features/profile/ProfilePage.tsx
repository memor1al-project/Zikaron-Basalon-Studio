import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthedUser } from "../../app/guards";
import { AppLayout } from "../../app/AppLayout";
import { getProfile, saveProfile, type UserProfile, type UserRole } from "./profileService";
import { switchLocalePath, useLocale } from "../../i18n";

/** Route-level page for /profile — the "Registration" step. Revisitable: pre-fills if a profile already exists. */
export function ProfilePage() {
  const user = useAuthedUser();
  const [existing, setExisting] = useState<UserProfile | null | "loading">("loading");

  useEffect(() => {
    getProfile(user.uid).then(setExisting);
  }, [user.uid]);

  if (existing === "loading") return null;

  return <ProfileForm initial={existing} profileDone={existing !== null} />;
}

/** Labels stay as English source text here; the page translates them at render. */
const roles: { value: UserRole; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "family", label: "Family member", hint: "Gathering a relative's story", icon: <HeartIcon /> },
  { value: "host", label: "Host", hint: "Presenting an evening", icon: <FlameSmallIcon /> },
  { value: "staff", label: "Zikaron BaSalon staff", hint: "Reviewing on the team's behalf", icon: <BadgeIcon /> },
];

function ProfileForm({ initial, profileDone }: { initial: UserProfile | null; profileDone: boolean }) {
  const user = useAuthedUser();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const [role, setRole] = useState<UserRole>(initial?.role ?? "family");
  // Defaults to the language this page is being read in, not to English: someone who
  // arrived at /he has already said which language they want.
  const [language, setLanguage] = useState<"en" | "he">(initial?.languagePreference ?? locale);
  const [relationshipNote, setRelationshipNote] = useState(initial?.relationshipNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const profile: UserProfile = {
        displayName: user.displayName ?? user.email ?? t("Unnamed"),
        email: user.email ?? "",
        role,
        languagePreference: language,
        ...(relationshipNote ? { relationshipNote } : {}),
      };
      await saveProfile(user.uid, profile, initial === null);
      // Picking a language here is a request to read the Studio in it. The prefix is a
      // router basename, so crossing languages needs a real navigation, not navigate().
      if (language !== locale) {
        window.location.assign(switchLocalePath(locale, "/collection/connect"));
        return;
      }
      navigate("/collection/connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong. Try again."));
      setSaving(false);
    }
  }

  return (
    <AppLayout step="registration" profileDone={profileDone}>
      <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <form
          onSubmit={handleSubmit}
          className="card-enter"
          style={{
            width: "100%",
            maxWidth: 460,
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 40,
            boxShadow: "0 24px 60px -30px oklch(30% 0.03 50 / 0.35)",
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="flicker" style={{ display: "inline-flex" }}>
                <FlameSmallIcon />
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  letterSpacing: ".09em",
                  textTransform: "uppercase",
                  color: "var(--accent-deep)",
                  fontWeight: 700,
                }}
              >
                {profileDone ? t("Registration") : t("One quick step")}
              </span>
            </div>
            <h1 style={{ fontSize: 24, lineHeight: 1.25, marginBottom: 8 }}>
              {profileDone ? t("Your details") : t("Tell us who you are")}
            </h1>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              {t("So the team knows who they're working with before any story starts.")}
            </p>
          </div>

          <div>
            <FieldLabel>{t("I'm here as a...")}</FieldLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className="option-card"
                  data-selected={role === r.value}
                  onClick={() => setRole(r.value)}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--card)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "transform 0.15s ease",
                      transform: role === r.value ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    {r.icon}
                  </span>
                  <span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t(r.label)}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t(r.hint)}</div>
                  </span>
                  {role === r.value && (
                    <span style={{ marginLeft: "auto", color: "var(--accent-deep)" }}>
                      <CheckIcon />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>{t("Preferred language")}</FieldLabel>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {(["en", "he"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className="option-card"
                  data-selected={language === lang}
                  onClick={() => setLanguage(lang)}
                  style={{ flex: 1, justifyContent: "center", fontSize: 13.5, fontWeight: 600 }}
                >
                  {lang === "en" ? t("English") : t("Hebrew")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="relationshipNote">{t("Relationship to the story (optional)")}</FieldLabel>
            <input
              id="relationshipNote"
              type="text"
              placeholder={t("e.g. granddaughter of Yosef Rosen")}
              value={relationshipNote}
              onChange={(e) => setRelationshipNote(e.target.value)}
              style={{ width: "100%", marginTop: 8 }}
            />
          </div>

          {error && <p style={{ fontSize: 13, color: "var(--accent-deep)" }}>{error}</p>}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <span className="spinner" />}
            {saving ? t("Saving...") : t("Continue")}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", display: "block" }}>
      {children}
    </label>
  );
}

function FlameSmallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3c1.2 2 3.5 4.4 3.5 7.8a3.5 3.5 0 1 1-7 0c0-1 .3-1.8.8-2.6.3.9 1 1.4 1.4 1.1-.4-1.8.2-3.6 1.3-6.3z"
        fill="var(--accent)"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.3-9-8.8A5 5 0 0 1 12 8a5 5 0 0 1 9 3.2C19 15.7 12 20 12 20z" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9.5" r="5.5" />
      <path d="M9 14.5L7 21l5-2.4L17 21l-2-6.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5 5.5-6" />
    </svg>
  );
}
