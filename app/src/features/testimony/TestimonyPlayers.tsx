import { TestimonyNavigator } from "./TestimonyNavigator";
import { useHtml5Player, useYouTubePlayer } from "./players";
import type { TestimonyChapters, TestimonyCue } from "./types";

/**
 * The two ways a testimony reaches the navigator: an example story hosted on YouTube,
 * and a family's own video file. Both hand the same { state, controls } to the same
 * chapter UI — only the element in the middle differs.
 */

const FRAME_STYLE = { position: "absolute" as const, inset: 0, width: "100%", height: "100%", border: "none" };

/**
 * The YouTube player's host element, split out so a page that needs the player's controls
 * for something else (the worked-example panel jumping to a chapter) can own the hook
 * itself and still render the same frame.
 */
export function YouTubeFrame({
  hostRef,
  error,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  error: string | null;
}) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9" }}>
      {error ? (
        <div style={{ ...FRAME_STYLE, display: "grid", placeItems: "center", color: "white", padding: 24 }}>{error}</div>
      ) : (
        // The API replaces this div with its own <iframe>, so nothing else may render into it.
        <div ref={hostRef} style={FRAME_STYLE} />
      )}
    </div>
  );
}

export function YouTubeTestimony({
  videoId,
  title,
  chapters,
  loadCues,
  onClose,
  layout,
}: {
  videoId: string;
  title: string;
  chapters: TestimonyChapters;
  loadCues?: () => Promise<TestimonyCue[]>;
  onClose?: () => void;
  layout?: "stacked" | "wide";
}) {
  const { hostRef, state, controls, error } = useYouTubePlayer(videoId);

  return (
    <TestimonyNavigator
      chapters={chapters}
      title={title}
      onClose={onClose}
      layout={layout}
      state={state}
      controls={controls}
      loadCues={loadCues}
      videoSlot={<YouTubeFrame hostRef={hostRef} error={error} />}
    />
  );
}

export function FileTestimony({
  src,
  title,
  chapters,
  loadCues,
  onClose,
  layout,
}: {
  src: string;
  title: string;
  chapters: TestimonyChapters;
  loadCues?: () => Promise<TestimonyCue[]>;
  onClose?: () => void;
  layout?: "stacked" | "wide";
}) {
  const { videoRef, state, controls } = useHtml5Player();

  return (
    <TestimonyNavigator
      chapters={chapters}
      title={title}
      onClose={onClose}
      layout={layout}
      state={state}
      controls={controls}
      loadCues={loadCues}
      videoSlot={
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          style={{ width: "100%", aspectRatio: "16 / 9", display: "block", background: "black" }}
        />
      }
    />
  );
}
