import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Page views for a single-page app.
 *
 * gtag's own page_view fires once, when the document loads. Every navigation after that is
 * a React route change the tag never sees, so without this the reports would show only
 * whichever page each visitor happened to land on first — and almost nothing about the
 * testimonies people actually open.
 */

declare global {
  interface Window {
    __GA_ID__?: string;
    __GA_ENABLED__?: boolean;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function useAnalytics(): void {
  const location = useLocation();

  useEffect(() => {
    if (!window.__GA_ENABLED__ || !window.gtag || !window.__GA_ID__) return;
    window.gtag("event", "page_view", {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location.pathname, location.search]);
}
