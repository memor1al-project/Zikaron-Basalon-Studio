import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { sendEmailSignInLink, signInWithGoogle, useAuth } from "./useAuth";
import { GalleryBackground } from "./GalleryBackground";

export function SignIn() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/profile" replace />;

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    await sendEmailSignInLink(email);
    setSending(false);
    setLinkSent(true);
  }

  async function handleGoogleClick() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(760px 520px at 12% -10%, oklch(91% 0.035 55 / 0.9), transparent 60%)," +
          "radial-gradient(680px 520px at 108% 18%, oklch(92% 0.02 140 / 0.8), transparent 55%)," +
          "var(--bg-cream)",
      }}
    >
      <header
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 11,
          padding: "22px 40px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <LogoMark />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontFamily: "Domine, serif", fontSize: 18, fontWeight: 600 }}>
              Zikaron BaSalon
            </span>
            <span
              style={{
                fontSize: 10.5,
                letterSpacing: ".06em",
                color: "var(--ink-soft)",
                textTransform: "uppercase",
              }}
            >
              Story Studio
            </span>
          </div>
        </div>
        <a
          href="https://www.zikaronbasalon.com/"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12.5, color: "var(--ink-soft)" }}
        >
          zikaronbasalon.com ↗
        </a>
      </header>

      <main
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        {/* "fill" rather than "pinned": this panel is a fixed slice between the
            header and the footer and never scrolls, so the grid matches its box. */}
        <GalleryBackground fit="fill" />
        <div
          className="card-enter"
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: 400,
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 40,
            boxShadow: "0 24px 60px -30px oklch(30% 0.03 50 / 0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span className="flicker" style={{ display: "inline-flex" }}>
              <FlameIcon />
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
              Sign in
            </span>
          </div>

          <h1 style={{ fontSize: 26, lineHeight: 1.25, marginBottom: 10 }}>
            Welcome back to your story.
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 28 }}>
            Sign in to continue gathering, or start a new one.
          </p>

          <button
            onClick={handleGoogleClick}
            disabled={googleLoading}
            className="btn-primary"
            style={{ width: "100%" }}
          >
            {googleLoading ? <span className="spinner" /> : <GoogleGIcon />}
            {googleLoading ? "Opening Google..." : "Continue with Google"}
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "24px 0",
              color: "var(--ink-soft)",
              fontSize: 12.5,
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            or
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          {linkSent ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                background: "var(--sage-soft)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <CheckIcon />
              <span style={{ fontSize: 13, color: "var(--ink)" }}>
                Check your email for a sign-in link.
              </span>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" disabled={sending} className="btn-secondary">
                {sending && <span className="spinner" style={{ marginRight: 8 }} />}
                {sending ? "Sending..." : "Email me a sign-in link"}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer
        style={{
          position: "relative",
          zIndex: 1,
          padding: "24px 40px",
          borderTop: "1px solid var(--line)",
          textAlign: "center",
          fontSize: 12.5,
          color: "var(--ink-soft)",
        }}
      >
        A joint initiative to help families and hosts gather and share their story, with care.
      </footer>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 11.5L12 4l9 7.5"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.3c1 1.1 1.5 1.9 1.5 2.9a1.5 1.5 0 1 1-3 0c0-1 .5-1.8 1.5-2.9z"
        fill="var(--accent)"
      />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3c1.2 2 3.5 4.4 3.5 7.8a3.5 3.5 0 1 1-7 0c0-1 .3-1.8.8-2.6.3.9 1 1.4 1.4 1.1-.4-1.8.2-3.6 1.3-6.3z"
        fill="var(--accent)"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--sage)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.3 2.3 4.7-5" />
    </svg>
  );
}

function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" opacity=".9" />
      <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" opacity=".7" />
      <path fill="#fff" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z" opacity=".5" />
      <path fill="#fff" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" opacity=".8" />
    </svg>
  );
}
