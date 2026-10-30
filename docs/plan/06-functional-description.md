# Functional Description — Story Studio as built

What the application actually does today, feature by feature. This is a description of
working software, not a plan; for what's still ahead see [Roadmap](04-roadmap.md).

**Live:** https://zikaronbasalon-story-studio.web.app (`noindex, nofollow` — not public-facing yet)

---

## 1. Shape of the product

Two wizards, sharing one account, one sidebar, and one visual language.

| | Collection Wizard | Presentation Wizard |
|---|---|---|
| For | A family gathering a relative's story | A host preparing an evening |
| Steps | Storage → Materials → Family tree (optional) → Story → Summary | Example stories |
| Sign-in | Required | **Not** required — examples are open to anyone |
| State | Per-user, saved to Firestore | Read-only, bundled JSON |
| Status | All steps working | Examples gallery working; builder not started |

The example stories sit deliberately outside the auth gate: someone deciding whether to
register can first see real testimony and see how a story gets built from it.

## 2. Account and profile

- **Sign-in** — Google, or an email sign-in link (no passwords).
- **Profile** — name plus one of three roles: *Family member* (gathering a relative's
  story), *Host* (presenting an evening), or *Zikaron BaSalon staff* (reviewing on the
  team's behalf).
- A profile must exist before any wizard step opens; the role is what later lets the team
  tell who submitted what.

## 3. Collection Wizard

### 3.1 Storage — where materials live

Materials are **not** uploaded into the product. The family connects a location they
already control and keeps it:

- **This device** — a local folder, via the File System Access API, re-openable on return.
- **Google Drive** — a Drive folder, reconnectable where you left off.

Both sit behind one provider interface, so a third can be added without touching the
wizard ([Storage abstraction](02-storage-abstraction.md)).

### 3.2 Materials — the grid

Everything in the connected folder appears as a tagged grid: photographs, documents,
audio, video. Per item the family can add tags, notes, a location, and connections to
other items, then search across all of it by name, tag, note, or place.

AI assistance runs server-side through `/api/materials` (summarize a document, build a
timeline, compose a story draft, transcribe audio, segment a testimony) — the same
compiled service the offline example-building scripts use, so prompts live in one place.

### 3.3 Family tree — optional throughout

Who the story sits inside. The one step nobody has to complete: it gates nothing, and the
sidebar labels it *Optional* so an empty one doesn't read as unfinished work.

Three doors, because families arrive in different states:

- **From tagged faces** — the Collection step already extracts faces from photographs and
  lets someone put a name to each one, and a named face is exactly a person. Those names
  are offered here as a picker, deduplicated across photographs, and chosen ones join the
  tree with their portrait attached. Offered first when any exist: the names are already
  typed, so it's the shortest route from nothing to a tree. Faces with no name are skipped
  — there'd be nothing to call the person. People added this way arrive **unlinked**; a
  photograph says who someone is, not how they're related, and inferring relationships
  from a group shot would be inventing genealogy.
- **Import** a GEDCOM (`.ged`) exported from Gramps, MyHeritage, Ancestry or similar.
- **Add people by hand**, saying how each one relates to somebody already there —
  parent of, child of, sibling of, partner of. Nobody writes GEDCOM `FAM` records
  themselves; the union bookkeeping happens behind that choice.

Portraits are re-encoded to 96px JPEGs before storage. The whole tree is one Firestore
document with a 1MB ceiling, and raw face crops are full-size PNGs — a handful would
exhaust it. The save path checks the serialized size and fails with a message naming the
cause rather than letting the SDK reject it opaquely.

The tree can be exported back to GEDCOM at any point, so nothing entered here is trapped.
A chart lays generations out in rows, partners side by side, with the story's subject
marked. Ported from the sibling `website` project — see §7 for what was taken and changed.

Relationships are stored as unions (a couple plus their children), matching GEDCOM's own
`FAM` record, rather than as a flat list of parent/spouse links. A flat list can't
round-trip: a childless couple disappears, and a child of a second marriage loses which
marriage it belonged to.

### 3.4 Story — the guided interview

Four sections, reworded from Zikaron BaSalon's own Speakers Kit outline:

1. **Setting the scene** — period covered, the feeling meant to come through, the teller's
   relationship to the person.
2. **Life before the war** — birth name and what they were called, when and where born,
   the family around them, the place of religion and tradition.
3. **The war years** — where the family was, a song or phrase that gave strength, a hard
   decision, who helped them.
4. **A message for today** — why share this now, what future generations should take from
   it, what listeners should carry.

The questions live in `storySections.json` rather than in component code, because the
example-building script answers *these exact questions* from real testimony. A worked
example therefore cannot answer a question the wizard doesn't ask.

### 3.5 Summary

Everything gathered pulled into one page. Nothing is reviewed or published from here — the
human review gate is a first-class state, not a later addition.

### 3.6 Products — what the story becomes

A gathered story is only worth the thing it turns into. Three, offered from the same card
on Summary **and** on every example story page, so a host can see what they'd end up with
before starting one of their own. All three are built in the browser and saved straight to
the device — nothing is uploaded.

| Product | Format | How |
|---|---|---|
| **Keepsake booklet** | PDF | The browser's own print dialog. Summary *is* the layout, and the family tree is SVG so it stays vector. |
| **Presentation** | `.pptx` | Editable in PowerPoint, Keynote or Slides. The family tree is drawn as native shapes, not a picture. |
| **Article** | Markdown | For an email or a newsletter. |

Deliberate choices worth keeping:

- **No AI rewriting.** The article and the deck carry the family's own words with the
  questions kept alongside, so neither can quietly become a claim nobody made.
- **Slides are for a room, not a reader.** Text is truncated on the slide and the full
  answer goes into the speaker notes.
- **The packer is lazy-loaded.** `pptxgenjs` is ~370KB and most people never export a
  deck, so it's a separate chunk that only downloads on first use.
- **A `.pptx` is an export, not a builder.** It hands the running order to whatever the
  host already uses rather than locking the evening inside this app — which is also why it
  doesn't conflict with the org's existing Microsoft-built tool.
- On a worked example, unanswered questions are **kept** in the article and **dropped**
  from the slides, with a closing slide counting them instead. A room doesn't need to be
  shown a blank; a family reading the article does.

## 4. Presentation Wizard — the example stories

### 4.1 The gallery

Thirteen real testimonies from Zikaron BaSalon's official YouTube channel
(`@zikaronbasalon`). Only public metadata is collected — title, video ID, duration,
thumbnail — and nothing is re-hosted; playback stays on YouTube.

Selection is filtered by title: testimony content is kept (עדות, שורד, ניצול, *Fighting to
Remember*), while explainers, panels, podcasts and registration clips are excluded, as is
anything under 90 seconds.

### 4.2 Testimony Navigator

A testimony can run 45 minutes. Handed a bare scrub bar, an older viewer has no way to
find the part they want and no way back if they lose their place. The navigator turns the
recording into a short list of named chapters they can read and tap.

Each chapter carries a title, a plain-language summary, its key subjects, and a colour
identity. Built for that viewer specifically:

- large type, enlargeable further (three text scales, remembered between visits)
- touch targets big enough to hit reliably, no hover-only affordances
- one-purpose buttons, and a chapter you can't accidentally fall out of
- subtitles lazy-loaded per video rather than bundled

Chapters are generated offline: audio extracted, transcribed with sentence-level
timestamps, then divided into chapters by Gemini. All thirteen have chapters and cues.

### 4.3 Story view — the same testimony through the wizard's questions

A family opening the Collection Wizard meets a blank form and questions nobody has asked
them before. Each testimony therefore also exists as a **worked example**: the wizard's own
questions, answered from the real recording.

- Every answer is tagged with the chapters it came from; clicking a chapter jumps the video
  to that moment.
- **Unanswered questions are shown as unanswered, not hidden.** A recording genuinely can't
  supply a birth name, a date, or why a family wants to share this now — and seeing those
  gaps is what tells a family which parts only they can fill in.

All thirteen testimonies have a story. The generation reuses the chapters and cues already
produced, so it needs no video, no ffmpeg, and no re-transcription.

## 5. Visual design

Warm cream ground, dark ink, terracotta accent, sage as the secondary — Domine for
headings, Karla for body.

The content panel sits on a grid of restored family photographs from the Helfgott
collection (portraits and Stryj street scenes, carried over from the sibling `website`
project). The grid is warmed toward the palette and laid under a cream veil that deepens
toward the bottom, so dark ink stays readable over it. It is scoped to the content panel:
the sidebar keeps a flat, slightly deeper cream beside it, and on the sign-in page the
grid sits between the header and footer rather than behind them. Column count responds to
the panel's own width via container queries, not the window's.

## 6. Offline pipeline

Three scripts build everything the examples rest on. None runs in the browser; all output
is committed as static JSON.

| Script | Does | Needs |
|---|---|---|
| `collect-testimony-videos.mjs` | Pulls testimony metadata from the channel | `yt-dlp` |
| `segment-testimony-videos.mjs` | Transcribes and divides into chapters + cues | `ffmpeg`, `GEMINI_API_KEY` |
| `build-example-stories.mjs` | Answers the wizard's questions from each testimony | `GEMINI_API_KEY` |

Run in that order. Each supports `--only <videoId>`, `--force`, and the segmenter adds
`--dry-run` and `--max-minutes` for cheap smoke tests.

## 7. What came from the sibling `website` project

The family tree is the first feature built by porting rather than from scratch. Worth
recording what was taken and what was deliberately changed, because the two codebases will
keep borrowing from each other.

| From `website` | Here | Change |
|---|---|---|
| `GedcomTranslator.ts` | `familytree/gedcom.ts` | Same record split and level scan. `FAM` becomes a union instead of flat links; `SEX` is now read and written (export needs it for `HUSB`/`WIFE`); a GEDCOM writer was added, which the website has no need for. |
| `SimpleFamilyTreeRenderer.ts` | `familytree/treeLayout.ts` + `FamilyTreeChart.tsx` | Generation rows and partner adjacency kept. Drawing rewritten from D3-on-dark to plain SVG on cream — this app has no D3 dependency. The single BFS pass was replaced by a fixed point: its one-shot assignment leaves partners on different rows whenever one of them has no parents in the file, which the Strupp tree triggers and which drew a diagonal across the whole chart. |
| `AddPersonDialog.tsx` | `familytree/PersonDialog.tsx` | Field set and the relate-to-an-existing-person picker kept; restyled from dark glass to the app's cream card. Face-crop picking dropped — face data lives on materials here, not on tree people. |
| `GedcomPage.tsx` | The empty state's explainer | Copy adapted. That page exists because most people have never heard of GEDCOM and won't look for an export button they can't name; the same is true here, so the explanation sits where the import lives instead of on its own page. |

There is **no** family-tree skill in `.claude/skills` — the `memorial-text-ai` and
`memorial-events-map-ai` skills reference GEDCOM parsing as a dependency of summarization
and proximity scoring, but neither carries the tree feature itself.

Imports are checked against the real `.ged` files in the website's `resources/families/`
(Helfgott 216 people / 57 families, Strupp, Schwartz, Perry): every individual and family
parses, the graph survives a serialize-and-re-parse round trip, and re-keying an import
onto an existing tree leaves no colliding or dangling ids.

## 8. Deliberately not built yet

- **Consent and privacy flows** — nothing here touches real survivor data until resolved.
- **Editorial authority** — the review gate exists; who holds override power is undecided.
- **The Presentation Wizard's builder** — only the examples half exists. Zikaron BaSalon
  already has a live AI builder tool built with Microsoft; that gets checked before
  anything is built from scratch here.
