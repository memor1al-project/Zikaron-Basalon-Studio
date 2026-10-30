import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { activeSegmentIndexAt, formatTime } from "./players";
import { colorFor } from "./chapterColors";
import { labelsFor } from "./labels";
import type { PlayerControls, PlayerState, TestimonyChapters, TestimonyCue } from "./types";

/**
 * The Testimony Navigator.
 *
 * A recorded testimony can run 45 minutes. Handed a bare scrub bar, an older viewer
 * has no way to find the part they want and no way back if they lose their place.
 * This turns the recording into a short list of named chapters they can read and tap.
 *
 * Everything here is sized and worded for that viewer: large type they can enlarge
 * further, targets big enough to hit reliably, no hover-only affordances, plain
 * one-purpose buttons, and a chapter they can't accidentally fall out of.
 */

const TEXT_SCALES = [1, 1.2, 1.45];
const SCALE_STORAGE_KEY = "zb.testimony.textScale";
/** Pause this far before a chapter's end, so "stop at the end" doesn't spill into the next one. */
const CHAPTER_END_MARGIN = 0.35;

interface TestimonyNavigatorProps {
  chapters: TestimonyChapters;
  title: string;
  /** The <video> or YouTube host element — the navigator positions it but never touches it. */
  videoSlot: ReactNode;
  state: PlayerState;
  controls: PlayerControls;
  onClose?: () => void;
  /** Fetches the sentence-level subtitles, only when the viewer asks for them. */
  loadCues?: () => Promise<TestimonyCue[]>;
  /**
   * "stacked" keeps everything in one column (the material drawer). "wide" puts the
   * chapter list in a rail beside the video, for a full page with room to spare.
   */
  layout?: "stacked" | "wide";
}

export function TestimonyNavigator({
  chapters,
  title,
  videoSlot,
  state,
  controls,
  onClose,
  loadCues,
  layout = "stacked",
}: TestimonyNavigatorProps) {
  const { segments, dir, language } = chapters;
  const t = labelsFor(language);

  const [scaleIndex, setScaleIndex] = useState(readStoredScale);
  const [slow, setSlow] = useState(false);
  const [stayInChapter, setStayInChapter] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [cues, setCues] = useState<TestimonyCue[] | null>(null);
  const [cuesLoading, setCuesLoading] = useState(false);
  const lockedIndexRef = useRef<number | null>(null);

  const scale = TEXT_SCALES[scaleIndex];
  const fs = useCallback((size: number) => Math.round(size * scale * 10) / 10, [scale]);

  const activeIndex = useMemo(
    () => activeSegmentIndexAt(segments, state.currentTime),
    [segments, state.currentTime]
  );

  const active = segments[activeIndex];

  useEffect(() => {
    try {
      localStorage.setItem(SCALE_STORAGE_KEY, String(scaleIndex));
    } catch {
      // A viewer with site data blocked just doesn't get the size remembered.
    }
  }, [scaleIndex]);

  useEffect(() => {
    controls.setRate(slow ? 0.75 : 1);
  }, [slow, controls, state.ready]);

  const jumpTo = useCallback(
    (index: number) => {
      const segment = segments[index];
      if (!segment) return;
      lockedIndexRef.current = index;
      controls.seek(segment.startTime);
      controls.play();
    },
    [segments, controls]
  );

  // "Stop at the end of this chapter": hold the viewer in the chapter they chose, so a
  // long recording can't carry them somewhere they didn't ask to go.
  useEffect(() => {
    if (!stayInChapter || !state.playing) return;
    const locked = lockedIndexRef.current ?? activeIndex;
    const segment = segments[locked];
    if (!segment) return;
    if (state.currentTime >= segment.endTime - CHAPTER_END_MARGIN) {
      controls.pause();
      controls.seek(Math.max(segment.startTime, segment.endTime - CHAPTER_END_MARGIN));
    }
  }, [stayInChapter, state.playing, state.currentTime, segments, activeIndex, controls]);

  const toggleCaptions = useCallback(
    (next: boolean) => {
      setShowCaptions(next);
      // Fetched the first time they're asked for, then kept — turning captions off and
      // on again shouldn't re-download an hour of subtitles.
      if (!next || cues || cuesLoading || !loadCues) return;
      setCuesLoading(true);
      loadCues()
        .then(setCues)
        .catch(() => setCues([]))
        .finally(() => setCuesLoading(false));
    },
    [cues, cuesLoading, loadCues]
  );

  const currentCue = useMemo(() => {
    if (!showCaptions || !cues?.length) return null;
    return cues.find((c) => state.currentTime >= c.start && state.currentTime < c.end) ?? null;
  }, [showCaptions, cues, state.currentTime]);

  const togglePlay = useCallback(() => {
    if (state.playing) controls.pause();
    else {
      lockedIndexRef.current = activeIndex;
      controls.play();
    }
  }, [state.playing, controls, activeIndex]);

  // Arrow keys move by chapter. In an RTL testimony "left" is forward, which is what a
  // Hebrew-reading viewer expects from the on-screen order of the buttons.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return;
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward) {
      e.preventDefault();
      jumpTo(Math.min(activeIndex + 1, segments.length - 1));
    } else if (e.key === back) {
      e.preventDefault();
      jumpTo(Math.max(activeIndex - 1, 0));
    } else if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    }
  }

  if (!segments.length) {
    return (
      <div dir={dir} style={{ padding: 32, fontSize: fs(18), textAlign: "center", color: "var(--ink-soft)" }}>
        {t.noChapters}
      </div>
    );
  }

  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <h2 style={{ fontSize: fs(21), lineHeight: 1.3, margin: 0 }}>{title}</h2>
      {onClose && (
        <button type="button" onClick={onClose} className="btn-secondary" style={bigButton(fs, { flexShrink: 0 })}>
          {t.close}
        </button>
      )}
    </div>
  );

  const mainColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── video + chapter strip ── */}
      <div>
        <div style={{ position: "relative", background: "black", borderRadius: 12, overflow: "hidden" }}>
          {videoSlot}
        </div>

        {/* Where you are, in chapter-sized pieces rather than one undifferentiated bar. */}
        <div
          role="group"
          aria-label={t.chapters}
          style={{ display: "flex", gap: 3, marginTop: 8, height: 20, direction: "ltr" }}
        >
          {segments.map((segment, i) => {
            const played =
              state.currentTime >= segment.endTime
                ? 1
                : state.currentTime <= segment.startTime
                  ? 0
                  : (state.currentTime - segment.startTime) / Math.max(1, segment.endTime - segment.startTime);
            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => jumpTo(i)}
                aria-label={t.jumpTo(segment.title)}
                aria-current={i === activeIndex}
                title={segment.title}
                style={{
                  position: "relative",
                  flexGrow: Math.max(1, segment.endTime - segment.startTime),
                  flexBasis: 0,
                  border: i === activeIndex ? "2px solid var(--ink)" : "none",
                  borderRadius: 5,
                  padding: 0,
                  background: "var(--bg-cream-2)",
                  overflow: "hidden",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    insetInlineStart: 0,
                    top: 0,
                    bottom: 0,
                    width: `${played * 100}%`,
                    background: colorFor(i),
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── what's being said right now ── */}
      {showCaptions && (
        <div
          aria-live="polite"
          style={{
            minHeight: fs(58),
            background: "var(--bg-cream-2)",
            borderRadius: 12,
            padding: "14px 18px",
            fontSize: fs(19),
            fontWeight: 500,
          }}
        >
          {cuesLoading ? t.loading : (currentCue?.text ?? "")}
        </div>
      )}

      {/* ── the chapter you're in ── */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderInlineStartWidth: 6,
          borderInlineStartColor: colorFor(activeIndex),
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <div style={{ fontSize: fs(14), color: "var(--ink-soft)", marginBottom: 4 }}>
          {t.chapterOf(activeIndex + 1, segments.length)} · {formatTime(active.startTime)}–{formatTime(active.endTime)}
        </div>
        <h3 style={{ fontSize: fs(22), lineHeight: 1.3, marginBottom: 8 }}>{active.title}</h3>
        <p style={{ fontSize: fs(17), color: "var(--ink)", marginBottom: active.keySubjects.length ? 14 : 0 }}>
          {active.summary}
        </p>

        {active.keySubjects.length > 0 && (
          <div>
            <div style={{ fontSize: fs(13), color: "var(--ink-soft)", marginBottom: 6 }}>{t.topics}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {active.keySubjects.map((subject) => (
                <span
                  key={subject}
                  style={{
                    fontSize: fs(14),
                    background: "var(--accent-soft)",
                    color: "var(--accent-deep)",
                    padding: "5px 12px",
                    borderRadius: 14,
                  }}
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── transport ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => jumpTo(Math.max(activeIndex - 1, 0))}
          disabled={activeIndex === 0}
          className="btn-secondary"
          style={bigButton(fs)}
        >
          <Chevron dir={dir === "rtl" ? "forward" : "back"} /> {t.previousChapter}
        </button>

        <button
          type="button"
          onClick={togglePlay}
          className="btn-primary"
          style={bigButton(fs, { minWidth: fs(150), fontSize: fs(18) })}
        >
          {state.playing ? <PauseGlyph /> : <PlayGlyph />} {state.playing ? t.pause : t.play}
        </button>

        <button
          type="button"
          onClick={() => jumpTo(Math.min(activeIndex + 1, segments.length - 1))}
          disabled={activeIndex === segments.length - 1}
          className="btn-secondary"
          style={bigButton(fs)}
        >
          {t.nextChapter} <Chevron dir={dir === "rtl" ? "back" : "forward"} />
        </button>

        <button
          type="button"
          onClick={() => controls.seek(Math.max(0, state.currentTime - 10))}
          className="btn-secondary"
          style={bigButton(fs)}
        >
          ↺ {t.back10}
        </button>
      </div>

      {/* ── viewing preferences ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", fontSize: fs(14) }}>
        <Toggle label={t.speed} scale={fs}>
          <SegButton active={slow} onClick={() => setSlow(true)} scale={fs}>
            {t.slow}
          </SegButton>
          <SegButton active={!slow} onClick={() => setSlow(false)} scale={fs}>
            {t.normal}
          </SegButton>
        </Toggle>

        <Toggle label={t.textSize} scale={fs}>
          {TEXT_SCALES.map((value, i) => (
            <SegButton key={value} active={i === scaleIndex} onClick={() => setScaleIndex(i)} scale={fs}>
              <span style={{ fontSize: 12 + i * 5 }}>A</span>
            </SegButton>
          ))}
        </Toggle>

        <CheckOption checked={stayInChapter} onChange={setStayInChapter} label={t.stayInChapter} scale={fs} />

        {loadCues && <CheckOption checked={showCaptions} onChange={toggleCaptions} label={t.captions} scale={fs} />}
      </div>

    </div>
  );

  const chapterList = (
    <div>
      <h3 style={{ fontSize: fs(17), marginBottom: 10 }}>{t.chapters}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((segment, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={segment.id}
              type="button"
              onClick={() => jumpTo(i)}
              aria-current={isActive}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                textAlign: dir === "rtl" ? "right" : "left",
                minHeight: fs(62),
                padding: "12px 16px",
                borderRadius: 12,
                // The chapter's own colour carries across strip, row and summary panel.
                border: `2px solid ${isActive ? colorFor(i) : "var(--line)"}`,
                borderInlineStartWidth: 6,
                borderInlineStartColor: colorFor(i),
                background: isActive ? "var(--card)" : "var(--bg-cream)",
                boxShadow: isActive ? `0 2px 12px -4px ${colorFor(i)}` : "none",
                color: "var(--ink)",
                width: "100%",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: fs(34),
                  height: fs(34),
                  borderRadius: "50%",
                  background: colorFor(i),
                  color: "white",
                  fontSize: fs(15),
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: fs(17), fontWeight: 600, lineHeight: 1.35 }}>
                  {segment.title}
                </span>
                <span style={{ display: "block", fontSize: fs(14), color: "var(--ink-soft)" }}>
                  {formatTime(segment.startTime)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      dir={dir}
      onKeyDown={handleKeyDown}
      style={{ display: "flex", flexDirection: "column", gap: 18, fontSize: fs(16), lineHeight: 1.55 }}
    >
      {header}
      {layout === "wide" ? (
        <div className="testimony-wide">
          {mainColumn}
          <div className="testimony-rail">{chapterList}</div>
        </div>
      ) : (
        <>
          {mainColumn}
          {chapterList}
        </>
      )}
    </div>
  );
}

/* ── small pieces ── */

function readStoredScale(): number {
  try {
    const stored = Number(localStorage.getItem(SCALE_STORAGE_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < TEXT_SCALES.length ? stored : 0;
  } catch {
    return 0;
  }
}

/** Every control is at least ~56px tall — reliably hittable with an unsteady hand. */
function bigButton(fs: (n: number) => number, extra: CSSProperties = {}): CSSProperties {
  return {
    minHeight: 56,
    padding: "12px 20px",
    fontSize: fs(15.5),
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    ...extra,
  };
}

function Toggle({ label, scale, children }: { label: string; scale: (n: number) => number; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "var(--ink-soft)", fontSize: scale(14) }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>{children}</div>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  scale,
  children,
}: {
  active: boolean;
  onClick: () => void;
  scale: (n: number) => number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: 46,
        minWidth: 52,
        padding: "8px 14px",
        fontSize: scale(14),
        fontWeight: 600,
        borderRadius: 10,
        border: `2px solid ${active ? "var(--accent)" : "var(--line)"}`,
        background: active ? "var(--accent-soft)" : "var(--card)",
        color: active ? "var(--accent-deep)" : "var(--ink)",
      }}
    >
      {children}
    </button>
  );
}

function CheckOption({
  checked,
  onChange,
  label,
  scale,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  scale: (n: number) => number;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 46 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 22, height: 22, accentColor: "var(--accent-deep)", padding: 0 }}
      />
      <span style={{ fontSize: scale(14.5) }}>{label}</span>
    </label>
  );
}

function Chevron({ dir }: { dir: "forward" | "back" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={dir === "forward" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}
      />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}
