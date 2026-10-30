import { Link, useParams } from "react-router-dom";
import { PresentationPageShell } from "./PresentationPageShell";
import { ExampleTabs } from "./ExampleTabs";
import { chaptersForVideo, storyForVideo } from "../testimony/exampleChapters";
import { ExampleStoryPanel } from "../testimony/ExampleStoryPanel";
import { colorFor } from "../testimony/chapterColors";
import { exampleArticle } from "./exampleArticle";
import { exampleDeck } from "./exampleDeck";
import { downloadDeck } from "../products/storyDeck";
import { ArticleIcon, BookletIcon, DeckIcon, ProductsCard } from "../products/ProductsCard";
import { downloadText, fileStem, printAsBooklet, type StoryProduct } from "../products/storyProducts";
import type { TestimonySegment } from "../testimony/types";
import testimonies from "./exampleTestimonies.json";
import { useT } from "../../i18n";

interface Testimony {
  id: string;
  title: string;
  url: string;
}

/**
 * "How this becomes a story" as a page of its own.
 *
 * It's a reading task, not a watching one — fourteen questions, their answers, and the
 * gaps — so it gets the reading column rather than the testimony tab's full-bleed layout.
 * Chapter links hand off to the testimony tab with a ?t= cue rather than embedding a
 * second copy of the player here.
 */
export function ExampleStoryPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const video = (testimonies as Testimony[]).find((t) => t.id === videoId);
  const chapters = videoId ? chaptersForVideo(videoId) : null;
  const story = videoId ? storyForVideo(videoId) : null;
  const t = useT();

  if (!video) {
    return (
      <PresentationPageShell>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("Testimony not found")}</h1>
        <Link to="/presentation/examples" style={{ fontSize: 13.5 }}>
          {t("All example stories")}
        </Link>
      </PresentationPageShell>
    );
  }

  const products: StoryProduct[] = story
    ? [
        {
          id: "booklet",
          label: "Keepsake booklet",
          hint: "This worked example as a printable PDF.",
          icon: <BookletIcon />,
          run: () => printAsBooklet(`${story.title} — Zikaron BaSalon`),
        },
        {
          id: "deck",
          label: "Presentation",
          hint: "A PowerPoint running order, to see how an evening would be built.",
          icon: <DeckIcon />,
          run: () => downloadDeck(exampleDeck(story, video.url), `${fileStem(story.title)}.pptx`),
        },
        {
          id: "article",
          label: "Article",
          hint: "The questions and answers as text, with a link back to the recording.",
          icon: <ArticleIcon />,
          run: () => downloadText(`${fileStem(story.title)}.md`, exampleArticle(story, video.url)),
        },
      ]
    : [];

  return (
    <PresentationPageShell>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <Link
          to="/presentation/examples"
          style={{ fontSize: 13.5, color: "var(--ink-soft)", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {t("All example stories")}
        </Link>
      </div>

      <h1 style={{ fontSize: 23, lineHeight: 1.3, marginBottom: 14 }}>{video.title}</h1>

      <div className="no-print">
        <ExampleTabs videoId={video.id} active="story" storyAvailable={Boolean(story)} />
      </div>

      <ProductsCard
        title="Make something from this story"
        subtitle="The same two products a family gets from their own story, so a host can see what they'd end up with."
        products={products}
      />

      {story && chapters ? (
        <ExampleStoryPanel
          story={story}
          segments={chapters.segments}
          colorFor={colorFor}
          segmentHref={(segment: TestimonySegment) =>
            `/presentation/examples/${video.id}?t=${Math.floor(segment.startTime)}`
          }
        />
      ) : (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          No worked example for this testimony yet — run <code>scripts/build-example-stories.mjs</code> to add one.
        </p>
      )}
    </PresentationPageShell>
  );
}
