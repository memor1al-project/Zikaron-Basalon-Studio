import { useEffect, type ReactNode } from "react";
import { AppSidebar, type FlowStep } from "./AppSidebar";
import { GalleryBackground } from "../features/auth/GalleryBackground";

/**
 * Sidebar + content area. The tiled-photo backdrop is scoped to the content
 * panel, the same way it is on the sign-in page; the sidebar sits on flat cream
 * beside it.
 */
export function AppLayout({
  step,
  profileDone,
  signedIn,
  children,
}: {
  step: FlowStep;
  profileDone: boolean;
  signedIn?: boolean;
  children: ReactNode;
}) {
  // Marks the pages that have the nav rail, so a fixed element can sit clear of it.
  // Sign-in has no rail, and anything offset by its width would float in open space.
  useEffect(() => {
    document.body.classList.add("has-rail");
    return () => document.body.classList.remove("has-rail");
  }, []);

  return (
    <div style={{ minHeight: "100svh", display: "flex", position: "relative" }}>
      {/* display:flex so the rail stretches to the full page height — otherwise its
          tint and right border stop where its own nav items end. */}
      <div style={{ position: "relative", zIndex: 1, flexShrink: 0, display: "flex" }}>
        <AppSidebar current={step} profileDone={profileDone} signedIn={signedIn} />
      </div>
      <main style={{ flex: 1, position: "relative", zIndex: 1 }}>
        <GalleryBackground />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </main>
    </div>
  );
}
