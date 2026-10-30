import { useEffect, useState } from "react";
import { getSection } from "./interviewService";
import { locateQuote, type Marker } from "./quoteLocator";
import { storySections } from "./storySections";

/**
 * Where in this material's text the story drew from.
 *
 * Reads the interview back rather than storing markers on the material: the story is the
 * thing that changes — an answer gets rewritten, a section is reset — and a marker cached
 * on the material would keep pointing at a passage nothing is drawn from any more.
 *
 * Quotes that can't be found are dropped rather than approximated. A highlight in the wrong
 * place would attribute an answer to a passage that doesn't support it, which is worse than
 * showing no highlight at all.
 */
export function useSourceMarkers(input: {
  uid: string;
  /** metaKeyFor() of this material. */
  sourceKey: string;
  text: string | undefined;
  pageOffsets?: number[];
}): Marker[] {
  const { uid, sourceKey, text, pageOffsets } = input;
  const [markers, setMarkers] = useState<Marker[]>([]);

  useEffect(() => {
    if (!text) {
      setMarkers([]);
      return;
    }
    let cancelled = false;

    (async () => {
      const found: Marker[] = [];

      for (const section of storySections) {
        const data = await getSection(uid, section.key).catch(() => null);
        if (!data) continue;

        for (const field of section.fields) {
          if (data.answerSourceKeys?.[field.key] !== sourceKey) continue;
          const match = locateQuote(text, data.answerQuotes?.[field.key] ?? "", pageOffsets);
          if (!match) continue;
          found.push({
            ...match,
            sectionKey: section.key,
            sectionTitle: section.title,
            fieldLabel: field.label,
            slug: section.slug,
          });
        }

        for (const event of data.events) {
          if (!event.resourceKeys.includes(sourceKey)) continue;
          const match = locateQuote(text, event.quote ?? "", pageOffsets);
          if (!match) continue;
          found.push({
            ...match,
            sectionKey: section.key,
            sectionTitle: section.title,
            fieldLabel: event.title,
            slug: section.slug,
          });
        }
      }

      if (!cancelled) setMarkers(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, sourceKey, text, pageOffsets]);

  return markers;
}
