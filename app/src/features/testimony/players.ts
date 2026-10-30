import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerControls, PlayerState, TestimonySegment } from "./types";

/**
 * Two players, one interface. The navigator's chapter UI is identical for an example
 * story on YouTube and for a family's own uploaded video, so neither hook leaks its
 * mechanics past { state, controls }.
 */

/** How often we ask the player where it is. 250ms keeps the active chapter feeling immediate. */
const POLL_MS = 250;

const IDLE_STATE: PlayerState = { ready: false, playing: false, currentTime: 0, duration: 0 };

/* ── HTML5 <video> — uploaded materials ── */

export function useHtml5Player(): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: PlayerState;
  controls: PlayerControls;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlayerState>(IDLE_STATE);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () =>
      setState({
        ready: video.readyState > 0,
        playing: !video.paused && !video.ended,
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });

    const events = ["loadedmetadata", "timeupdate", "play", "pause", "ended", "seeked", "durationchange"];
    events.forEach((e) => video.addEventListener(e, sync));
    sync();
    return () => events.forEach((e) => video.removeEventListener(e, sync));
  }, []);

  const controls = useMemo<PlayerControls>(
    () => ({
      play: () => void videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      seek: (seconds) => {
        if (videoRef.current) videoRef.current.currentTime = seconds;
      },
      setRate: (rate) => {
        if (videoRef.current) videoRef.current.playbackRate = rate;
      },
    }),
    []
  );

  return { videoRef, state, controls };
}

/* ── YouTube IFrame API — example stories ── */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
}

type WindowWithYT = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the IFrame API once per page — a second <script> tag would clobber the global callback. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const w = window as WindowWithYT;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    w.onYouTubeIframeAPIReady = () => resolve((window as WindowWithYT).YT!);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Could not load the YouTube player"));
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function useYouTubePlayer(videoId: string): {
  hostRef: React.RefObject<HTMLDivElement | null>;
  state: PlayerState;
  controls: PlayerControls;
  error: string | null;
} {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [state, setState] = useState<PlayerState>(IDLE_STATE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: number | undefined;

    // Held separately from playerRef: if the component unmounts before onReady fires,
    // this is the only handle left to tear the iframe down with.
    let createdPlayer: YTPlayer | null = null;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const player = new YT.Player(hostRef.current, {
          videoId,
          // rel/modestbranding keep YouTube's own suggestions out of the way — an
          // unrelated video thumbnail mid-testimony is exactly the wrong thing here.
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              // YouTube has no timeupdate event, so poll for position.
              poll = window.setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                setState({
                  ready: true,
                  playing: p.getPlayerState() === YT.PlayerState.PLAYING,
                  currentTime: p.getCurrentTime() ?? 0,
                  duration: p.getDuration() ?? 0,
                });
              }, POLL_MS);
            },
          },
        });
        createdPlayer = player;
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (poll) window.clearInterval(poll);
      (playerRef.current ?? createdPlayer)?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  const controls = useMemo<PlayerControls>(
    () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seek: (seconds) => playerRef.current?.seekTo(seconds, true),
      setRate: (rate) => playerRef.current?.setPlaybackRate(rate),
    }),
    []
  );

  return { hostRef, state, controls, error };
}

/* ── shared helpers ── */

/** Formats seconds as m:ss / h:mm:ss — the only time format the navigator shows. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Which chapter a given playback position falls in — shared with the worked-example panel. */
export function activeSegmentIndexAt(segments: TestimonySegment[], currentTime: number): number {
  if (!segments.length) return 0;
  const duration = segments[segments.length - 1].endTime;
  const found = segments.findIndex((s) => currentTime >= s.startTime && currentTime < s.endTime);
  return found === -1 ? (currentTime >= duration ? segments.length - 1 : 0) : found;
}
