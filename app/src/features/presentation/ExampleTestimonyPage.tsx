import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PresentationPageShell } from "./PresentationPageShell";
import { ExampleTabs } from "./ExampleTabs";
import { chaptersForVideo, cueLoaderForVideo, storyForVideo } from "../testimony/exampleChapters";
import { TestimonyNavigator } from "../testimony/TestimonyNavigator";
import { YouTubeFrame } from "../testimony/TestimonyPlayers";
import { useYouTubePlayer } from "../testimony/players";
import testimonies from "./exampleTestimonies.json";

interface Testimony {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  channel: string | null;
}

/**
 * One example testimony, as a full page rather than a modal — a 45-minute recording with
 * a dozen chapters needs the whole main area, not a dialog floating over a gallery.
 *
 * The page owns the player rather than letting the navigator hide it, so a ?t= cue from
 * the story tab can seek this video once it's ready.
 */
export function ExampleTestimonyPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const video = (testimonies as Testimony[]).find((t) => t.id === videoId);
  const chapters = videoId ? chaptersForVideo(videoId) : null;

  if (!video) {
    return (
      <PresentationPageShell>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Testimony not found</h1>
        <BackLink />
      </PresentationPageShell>
    );
  }

  if (!chapters) {
    return (
      <PresentationPageShell>
        <div style={{ marginBottom: 16 }}>
          <BackLink />
        </div>
        <h1 style={{ fontSize: 22, lineHeight: 1.3, marginBottom: 14 }}>{video.title}</h1>
        <ExampleTabs videoId={video.id} active="testimony" storyAvailable={Boolean(storyForVideo(video.id))} />
        <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden" }}>
          <iframe
            src={`https://www.youtube.com/embed/${video.id}`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          />
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 12 }}>
          No chapters yet for this testimony — run <code>scripts/segment-testimony-videos.mjs</code> to add them.
        </p>
        <YouTubeLink url={video.url} />
      </PresentationPageShell>
    );
  }

  return <ChapteredTestimony video={video} chapters={chapters} />;
}

function ChapteredTestimony({
  video,
  chapters,
}: {
  video: Testimony;
  chapters: NonNullable<ReturnType<typeof chaptersForVideo>>;
}) {
  const { hostRef, state, controls, error } = useYouTubePlayer(video.id);
  const [searchParams] = useSearchParams();
  const startAt = Number(searchParams.get("t"));
  const cueHonouredRef = useRef(false);

  // A chapter link from the story tab arrives as ?t=<seconds>. Seek once the player is
  // ready, and only once — otherwise every later state update would drag it back here.
  useEffect(() => {
    if (!state.ready || cueHonouredRef.current || !(startAt > 0)) return;
    cueHonouredRef.current = true;
    controls.seek(startAt);
    controls.play();
  }, [state.ready, startAt, controls]);

  return (
    <PresentationPageShell width="full">
      <div style={{ marginBottom: 16 }}>
        <BackLink />
      </div>

      <ExampleTabs videoId={video.id} active="testimony" storyAvailable={Boolean(storyForVideo(video.id))} />

      <TestimonyNavigator
        chapters={chapters}
        title={video.title}
        layout="wide"
        state={state}
        controls={controls}
        loadCues={cueLoaderForVideo(video.id)}
        videoSlot={<YouTubeFrame hostRef={hostRef} error={error} />}
      />

      <YouTubeLink url={video.url} />
    </PresentationPageShell>
  );
}

function YouTubeLink({ url }: { url: string }) {
  return (
    <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--accent-deep)" }}>
        Open on YouTube ↗
      </a>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/presentation/examples"
      style={{ fontSize: 13.5, color: "var(--ink-soft)", display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      ← All example stories
    </Link>
  );
}
