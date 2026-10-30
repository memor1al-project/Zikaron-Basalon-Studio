import { displayName, initialsOf, lifespan, type FamilyTree } from "../familytree/familyTree";
import { layoutTree, NODE_RADIUS } from "../familytree/treeLayout";

/**
 * A PowerPoint deck as a story outcome.
 *
 * Zikaron BaSalon's actual product is an evening in a living room, and the host is
 * usually standing next to a laptop. A .pptx is the format that opens in whatever they
 * already have — PowerPoint, Keynote, Google Slides — and, crucially, that they can edit
 * afterwards. It hands the evening back to the host rather than locking the running order
 * inside this app.
 *
 * Everything here is laid out for a room rather than a reader: few words per slide, large
 * type, and the full answer text pushed into the speaker notes where it belongs.
 */

/** The app's palette as hex, since OOXML has no notion of our CSS custom properties. */
const CREAM = "F7F3EC";
const INK = "2F2118";
const INK_SOFT = "6E6158";
const ACCENT_DEEP = "9A4A2B";
const LINE = "D9D0C3";

const SERIF = "Georgia";
const SANS = "Calibri";

/** 16:9 at pptxgenjs's default inch scale. */
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.6;

export interface DeckBullet {
  /** The question, kept above its answer so a slide can't become a claim nobody made. */
  label?: string;
  text: string;
}

export interface DeckSlide {
  title: string;
  subtitle?: string;
  bullets?: DeckBullet[];
  /** A data: URL — object URLs aren't readable by the packer. */
  imageDataUrl?: string;
  notes?: string;
}

export interface DeckSpec {
  title: string;
  subtitle?: string;
  footer: string;
  slides: DeckSlide[];
  /** Drawn natively as shapes, so it stays editable in PowerPoint. */
  tree?: FamilyTree;
  /** Hebrew testimony reads right-to-left; the example stories carry this per file. */
  rtl?: boolean;
}

export async function downloadDeck(spec: DeckSpec, fileName: string): Promise<void> {
  // Loaded on demand: the packer is by far the heaviest thing in the app, and most
  // people never export a deck. Keeping it out of the main bundle costs one await.
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  const align = spec.rtl ? "right" : "left";
  const rtl = Boolean(spec.rtl);

  // ── Title ──
  const title = pptx.addSlide();
  title.background = { color: CREAM };
  title.addText(spec.title, {
    x: MARGIN,
    y: 1.7,
    w: SLIDE_W - MARGIN * 2,
    h: 1.2,
    fontSize: 40,
    bold: true,
    color: INK,
    fontFace: SERIF,
    align: "center",
    rtlMode: rtl,
  });
  if (spec.subtitle) {
    title.addText(spec.subtitle, {
      x: MARGIN,
      y: 2.9,
      w: SLIDE_W - MARGIN * 2,
      h: 0.5,
      fontSize: 18,
      color: INK_SOFT,
      fontFace: SANS,
      align: "center",
      rtlMode: rtl,
    });
  }
  title.addText(spec.footer, {
    x: MARGIN,
    y: SLIDE_H - 0.9,
    w: SLIDE_W - MARGIN * 2,
    h: 0.4,
    fontSize: 11,
    color: INK_SOFT,
    fontFace: SANS,
    align: "center",
  });

  if (spec.tree && spec.tree.people.length > 0) addTreeSlide(pptx, spec.tree);

  for (const slide of spec.slides) addContentSlide(pptx, slide, align, rtl);

  await pptx.writeFile({ fileName });
}

function addContentSlide(
  pptx: InstanceType<typeof import("pptxgenjs").default>,
  slide: DeckSlide,
  align: "left" | "right",
  rtl: boolean
) {
  const s = pptx.addSlide();
  s.background = { color: CREAM };

  s.addText(slide.title, {
    x: MARGIN,
    y: 0.45,
    w: SLIDE_W - MARGIN * 2,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: INK,
    fontFace: SERIF,
    align,
    rtlMode: rtl,
  });

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: MARGIN,
      y: 1.2,
      w: SLIDE_W - MARGIN * 2,
      h: 0.4,
      fontSize: 14,
      color: ACCENT_DEEP,
      fontFace: SANS,
      align,
      rtlMode: rtl,
    });
  }

  const bodyTop = slide.subtitle ? 1.75 : 1.45;
  const hasImage = Boolean(slide.imageDataUrl);
  const bodyWidth = hasImage ? (SLIDE_W - MARGIN * 2) * 0.52 : SLIDE_W - MARGIN * 2;

  if (slide.bullets?.length) {
    // One text block rather than a bullet list: the question sits in small caps above its
    // answer, which a plain bullet can't express.
    const runs = slide.bullets.flatMap((bullet, i) => [
      ...(bullet.label
        ? [
            {
              text: bullet.label,
              options: {
                fontSize: 12,
                color: INK_SOFT,
                fontFace: SANS,
                breakLine: true,
                paraSpaceBefore: i === 0 ? 0 : 10,
              },
            },
          ]
        : []),
      {
        text: bullet.text,
        options: { fontSize: 18, color: INK, fontFace: SANS, breakLine: true },
      },
    ]);

    s.addText(runs, {
      x: MARGIN,
      y: bodyTop,
      w: bodyWidth,
      h: SLIDE_H - bodyTop - 0.5,
      valign: "top",
      align,
      rtlMode: rtl,
    });
  }

  if (slide.imageDataUrl) {
    s.addImage({
      data: slide.imageDataUrl,
      x: SLIDE_W - MARGIN - (SLIDE_W - MARGIN * 2) * 0.44,
      y: bodyTop,
      w: (SLIDE_W - MARGIN * 2) * 0.44,
      h: SLIDE_H - bodyTop - 0.5,
      // "contain": a portrait photograph must not be cropped to fit a landscape box.
      sizing: {
        type: "contain",
        w: (SLIDE_W - MARGIN * 2) * 0.44,
        h: SLIDE_H - bodyTop - 0.5,
      },
    });
  }

  if (slide.notes) s.addNotes(slide.notes);
}

/**
 * The family tree as native shapes — ovals, connectors and labels — so a host can move a
 * person on the slide, and so it stays sharp on a projector. Positions come from the same
 * layout the on-screen chart uses, scaled from pixels into slide inches.
 */
function addTreeSlide(pptx: InstanceType<typeof import("pptxgenjs").default>, tree: FamilyTree) {
  const s = pptx.addSlide();
  s.background = { color: CREAM };
  s.addText("Family", {
    x: MARGIN,
    y: 0.35,
    w: SLIDE_W - MARGIN * 2,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: INK,
    fontFace: SERIF,
  });

  const geometry = layoutTree(tree);
  const top = 1.15;
  const availableW = SLIDE_W - MARGIN * 2;
  const availableH = SLIDE_H - top - 0.4;
  const scale = Math.min(availableW / geometry.width, availableH / geometry.height);

  // Centre whatever the scale leaves over.
  const offsetX = MARGIN + (availableW - geometry.width * scale) / 2;
  const offsetY = top + (availableH - geometry.height * scale) / 2;
  const px = (v: number) => v * scale;
  const at = (x: number, y: number) => ({ x: offsetX + px(x), y: offsetY + px(y) });

  for (const link of geometry.links) {
    const from = geometry.positionById[link.sourceId];
    const to = geometry.positionById[link.targetId];
    if (!from || !to) continue;

    if (link.relationship === "Spouse") {
      segment(s, pptx, at(from.x, from.y), at(to.x, to.y), true);
    } else {
      // Same orthogonal path the chart draws: down, across, down.
      const midY = (from.y + to.y) / 2;
      segment(s, pptx, at(from.x, from.y + NODE_RADIUS), at(from.x, midY), false);
      segment(s, pptx, at(from.x, midY), at(to.x, midY), false);
      segment(s, pptx, at(to.x, midY), at(to.x, to.y - NODE_RADIUS), false);
    }
  }

  const diameter = px(NODE_RADIUS * 2);
  for (const { person, x, y } of geometry.nodes) {
    const pos = at(x - NODE_RADIUS, y - NODE_RADIUS);
    s.addShape(pptx.ShapeType.ellipse, {
      x: pos.x,
      y: pos.y,
      w: diameter,
      h: diameter,
      fill: { color: person.isSubject ? "F0DDD2" : "FFFFFF" },
      line: { color: person.isSubject ? ACCENT_DEEP : LINE, width: person.isSubject ? 2 : 1 },
    });
    s.addText(initialsOf(person), {
      x: pos.x,
      y: pos.y,
      w: diameter,
      h: diameter,
      fontSize: Math.max(8, Math.round(px(15))),
      color: ACCENT_DEEP,
      fontFace: SERIF,
      bold: true,
      align: "center",
      valign: "middle",
    });

    const years = lifespan(person);
    const label = at(x - NODE_RADIUS * 2, y + NODE_RADIUS);
    s.addText(displayName(person) + (years ? `\n${years}` : ""), {
      x: label.x,
      y: label.y + 0.03,
      w: diameter * 2,
      h: 0.45,
      fontSize: Math.max(7, Math.round(px(11))),
      color: INK,
      fontFace: SANS,
      align: "center",
      valign: "top",
    });
  }
}

/**
 * One straight connector.
 *
 * pptxgenjs positions a line by a box plus width and height, so a segment running right
 * to left or bottom to top would need a negative size. Every segment the tree draws is
 * axis-aligned, so normalising to the top-left corner and absolute lengths is exact.
 */
function segment(
  slide: ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>,
  pptx: InstanceType<typeof import("pptxgenjs").default>,
  a: { x: number; y: number },
  b: { x: number; y: number },
  dashed: boolean
) {
  slide.addShape(pptx.ShapeType.line, {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    line: {
      color: dashed ? ACCENT_DEEP : LINE,
      width: dashed ? 1.5 : 1,
      dashType: dashed ? "dash" : "solid",
    },
  });
}

/** Object URL → data URL, since the packer reads bytes rather than fetching. */
export async function toDataUrl(objectUrl: string): Promise<string | null> {
  try {
    const response = await fetch(objectUrl);
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
