/** One navigable chapter of a testimony — what the navigator jumps between. */
export interface TestimonySegment {
  id: string;
  title: string;
  /** 1-2 plain sentences, written to be read by an older viewer. */
  summary: string;
  keySubjects: string[];
  startTime: number;
  endTime: number;
}

/** One spoken sentence with its position in the recording, in seconds. */
export interface TestimonyCue {
  start: number;
  end: number;
  text: string;
}

/** The chapter set for one testimony, as returned by /api/materials/segment. */
export interface TestimonyChapters {
  segments: TestimonySegment[];
  language: string;
  dir: "rtl" | "ltr";
}

/** A generated chapters file under features/presentation/testimonySegments/. */
export interface TestimonyChaptersFile extends TestimonyChapters {
  videoId: string;
  title: string;
  durationSeconds: number;
  generatedAt: string;
}

/* ── worked example: a testimony read back through the wizard's questions ── */

export interface ExampleStoryAnswer {
  key: string;
  label: string;
  /** Empty when this testimony never addresses the question — shown as such, not hidden. */
  answer: string;
  sourceSegmentIds: string[];
}

export interface ExampleStorySection {
  key: string;
  /** Matches a wizard route: /collection/story/<slug>. */
  slug: string;
  title: string;
  answers: ExampleStoryAnswer[];
}

export interface ExampleStoryEvent {
  id: string;
  title: string;
  when: string;
  description: string;
  segmentId: string;
}

export interface ExampleStoryFile {
  videoId: string;
  title: string;
  generatedAt: string;
  sections: ExampleStorySection[];
  events: ExampleStoryEvent[];
  language: string;
  dir: "rtl" | "ltr";
}

/* ── player abstraction ──
 * The navigator drives an example story on YouTube and a family's own uploaded file
 * through the same two objects, so the chapter UI never learns which one it's on. */

export interface PlayerState {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
}

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
}
