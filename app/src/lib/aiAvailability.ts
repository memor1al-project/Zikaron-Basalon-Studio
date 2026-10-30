import { useEffect, useState } from "react";

/**
 * Is the AI backend actually deployed?
 *
 * The Cloud Functions API needs a Blaze-plan project, so a perfectly valid deployment of
 * this app can ship without it. Everything that doesn't need a server — the example
 * stories, the testimony navigator, tags, notes, locations, on-device face extraction —
 * still works. Rather than letting those deployments fail one 502 at a time, the app asks
 * once whether the API is there and puts the AI actions out of reach when it isn't.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const PROBE_TIMEOUT_MS = 6000;

export type AiAvailability = "checking" | "available" | "unavailable";

/** Module-level so the probe runs once per page load, not once per material opened. */
let probe: Promise<boolean> | null = null;

export function checkAiAvailable(): Promise<boolean> {
  probe ??= runProbe();
  return probe;
}

async function runProbe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;

    // Firebase Hosting rewrites every unmatched path to index.html, so when the function
    // isn't deployed this request still answers 200 — with the SPA's HTML. A status code
    // proves nothing here; only the real JSON health payload does.
    const body = await response.json().catch(() => null);
    return (body as { status?: string } | null)?.status === "ok";
  } catch {
    // Aborted, offline, CORS, DNS — all mean the same thing to the caller.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useAiAvailability(): AiAvailability {
  const [availability, setAvailability] = useState<AiAvailability>("checking");

  useEffect(() => {
    let cancelled = false;
    checkAiAvailable().then((ok) => {
      if (!cancelled) setAvailability(ok ? "available" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
