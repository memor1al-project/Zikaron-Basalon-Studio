import { useState } from "react";
import { Link } from "react-router-dom";
import { formatTime } from "./players";
import type { ExampleStoryFile, TestimonySegment } from "./types";
import { useT } from "../../i18n";

/**
 * The same testimony, read back through the Collection Wizard's questions.
 *
 * A family opening the wizard meets a blank form and a set of questions nobody has asked
 * them before. This shows what a real recording looks like once it has been through those
 * questions: every answer is tagged with the chapters it came from, and clicking a chapter
 * jumps the video there — so "where does an answer like this come from?" has a visible one.
 *
 * Unanswered questions are shown as unanswered rather than hidden. A recording genuinely
 * can't supply a name, a date, or why the family wants to share it now, and seeing those
 * gaps is what tells a family which parts only they can fill in.
 */

interface ExampleStoryPanelProps {
  story: ExampleStoryFile;
  segments: TestimonySegment[];
  /** Colour identity for a chapter, shared with the navigator on the testimony tab. */
  colorFor: (index: number) => string;
  /** Where a chapter chip goes — the testimony tab, cued to that moment. */
  segmentHref: (segment: TestimonySegment) => string;
}

export function ExampleStoryPanel({ story, segments, colorFor, segmentHref }: ExampleStoryPanelProps) {
  const t = useT();
  const [openSection, setOpenSection] = useState<string | null>(story.sections[0]?.key ?? null);
  const indexById = new Map(segments.map((s, i) => [s.id, i]));

  const answeredCount = story.sections.flatMap((s) => s.answers).filter((a) => a.answer).length;
  const totalCount = story.sections.flatMap((s) => s.answers).length;

  return (
    <section>
      <p style={{ fontSize: 14.5, color: "var(--ink-soft)", marginBottom: 8, maxWidth: 760, lineHeight: 1.6 }}>
        {t("This testimony worked backwards through the same questions the Collection Wizard asks. Each answer links to the chapter it came from — open one to watch that moment. Questions left blank are ones a recording alone can't answer; those are the parts a family brings themselves.")}
      </p>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
        <strong style={{ color: "var(--ink)" }}>
          {answeredCount} {t("of")} {totalCount}
        </strong>{" "}
        {t("questions answered by this recording.")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {story.sections.map((section) => {
          const isOpen = openSection === section.key;
          const filled = section.answers.filter((a) => a.answer).length;

          return (
            <div
              key={section.key}
              style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--card)", overflow: "hidden" }}
            >
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : section.key)}
                aria-expanded={isOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  background: isOpen ? "var(--bg-cream-2)" : "transparent",
                  border: "none",
                  textAlign: "left",
                  color: "var(--ink)",
                }}
              >
                <span style={{ fontSize: 15.5, fontWeight: 600, flex: 1 }}>{section.title}</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: filled ? "var(--sage)" : "var(--ink-soft)",
                    background: filled ? "var(--sage-soft)" : "var(--bg-cream-2)",
                    padding: "3px 9px",
                    borderRadius: 10,
                  }}
                >
                  {filled}/{section.answers.length}
                </span>
                <span aria-hidden="true" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                  {isOpen ? "▲" : "▼"}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: "4px 18px 18px" }}>
                  {section.answers.map((answer) => {
                    return (
                      <div
                        key={answer.key}
                        style={{
                          padding: "12px 0",
                          borderTop: "1px solid var(--line)",
                          opacity: answer.answer ? 1 : 0.72,
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 5 }}>
                          {t(answer.label)}
                        </div>

                        {answer.answer ? (
                          <p dir={story.dir} style={{ fontSize: 14.5, lineHeight: 1.6 }}>
                            {answer.answer}
                          </p>
                        ) : (
                          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", fontStyle: "italic" }}>
                            Not answered in this recording — a family would fill this in themselves.
                          </p>
                        )}

                        {answer.sourceSegmentIds.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {answer.sourceSegmentIds.map((id) => {
                              const index = indexById.get(id);
                              if (index === undefined) return null;
                              const segment = segments[index];
                              return (
                                <Link
                                  key={id}
                                  to={segmentHref(segment)}
                                  title={`Watch from ${formatTime(segment.startTime)}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 12,
                                    padding: "4px 10px",
                                    borderRadius: 12,
                                    border: `1px solid ${colorFor(index)}`,
                                    background: "var(--bg-cream)",
                                    color: "var(--ink)",
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: "50%",
                                      background: colorFor(index),
                                    }}
                                  />
                                  {segment.title}
                                  <span style={{ color: "var(--ink-soft)" }}>{formatTime(segment.startTime)}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                    <Link
                      to={`/collection/story/${section.slug}`}
                      className="btn-secondary"
                      style={{ display: "inline-flex", fontSize: 13, padding: "9px 16px" }}
                    >
                      {t("Answer these for your own story")} →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {story.events.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>The same testimony as a timeline</h3>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 14, maxWidth: 760 }}>
            The wizard lets you attach moments to a story. Here each chapter has become one — this is what
            the events list would look like for this testimony.
          </p>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {story.events.map((event) => {
              const index = indexById.get(event.segmentId);
              const segment = index === undefined ? null : segments[index];
              return (
                <li key={event.id}>
                  <Link
                    to={segment ? segmentHref(segment) : "#"}
                    style={{
                      width: "100%",
                      display: "flex",
                      gap: 14,
                      textAlign: "left",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      borderInlineStartWidth: 5,
                      borderInlineStartColor: index === undefined ? "var(--line)" : colorFor(index),
                      background: "var(--card)",
                      color: "var(--ink)",
                    }}
                  >
                    <span style={{ minWidth: 0, flex: 1 }} dir={story.dir}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{event.title}</span>
                      {event.description && (
                        <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-soft)", marginTop: 3 }}>
                          {event.description}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--ink-soft)", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {event.when || (segment ? formatTime(segment.startTime) : "")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
