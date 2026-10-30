import { useState } from "react";
import { ComingSoonDialog } from "./ComingSoonDialog";

/**
 * What an AI action does while the service isn't running.
 *
 * Previously these buttons were simply disabled. That's honest but mute: it tells someone
 * the feature doesn't work without telling them it exists, is intended, and is coming — so
 * the likeliest reading is that the Studio is broken rather than unfinished.
 *
 * Clicking now explains the position instead. The guard below wraps a real handler, so a
 * panel keeps one code path whether the service is there or not.
 */
export function useAiComingSoon(available: boolean) {
  const [open, setOpen] = useState(false);

  /** Runs the action when the service is there; otherwise explains why it isn't. */
  function guard(run: () => void): () => void {
    return () => (available ? run() : setOpen(true));
  }

  return {
    guard,
    dialog: open ? <ComingSoonDialog onClose={() => setOpen(false)} /> : null,
  };
}
