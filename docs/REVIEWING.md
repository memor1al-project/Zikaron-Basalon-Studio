# Reporting issues on the Story Studio

The site carries a reviewing tool that lets anyone point at a part of the page and say
what is wrong with it. It is **off by default** — a family gathering a relative's story
has no use for it, and a stray click into picking mode over their testimony would be
alarming rather than helpful.

## Turning it on

Two ways.

**From the page itself.** Click the version number at the foot of the left sidebar
(`v0.11.9 · build 18`), then **הפעלת דיווח על תקלות**. It takes effect immediately — no
reload — and the button in that panel turns it off again.

**By link**, for sending a reviewer straight in. Open any page with `?report=1`:

    https://zikaronbasalon-story-studio.web.app/he/resources?report=1

That switches it on for that browser and stays on from then on, across pages and across
sessions. The flag is removed from the address bar once it has been read, so it does not
travel into links copied from the site afterwards.

To turn it off again: the same button in the version panel, `?report=0`, or
**לכבות אותו** at the foot of the reports panel.

The setting lives in `localStorage`, so it is per browser and per device. Send the link
to each reviewer rather than expecting the setting to follow an account.

## Using it

1. Press **דיווח על תקלה**, bottom left.
2. The page becomes a picker — whatever is under the cursor is outlined.
3. Click the element. Escape cancels.
4. Choose what kind of problem it is and describe what you saw.
5. The counter beside the button opens the list of everything staged so far.

## Getting the reports out

Nothing is uploaded. Reports stay in that browser until someone exports them.

- **העתקת הרשימה** copies a Markdown summary grouped by page — readable in a message or
  an email, and the quickest thing to hand to whoever is fixing it.
- **הורדה כקובץ** downloads JSON with the same reports, including the CSS selector for
  each element.

Both carry, for every report: the element, the text that was on screen, the page, the
interface language, the viewport size, and **the version and build number**. The build
number matters — a report against build 16 is a different report from one against build
17, and without it you end up chasing things that were already fixed.

The exported labels are English (`**Wording**`, `**Doesn't work**`) even when the
reviewer worked in Hebrew. That is deliberate: the export is for whoever fixes the
problem, not for the person who reported it.

## What it deliberately cannot do

It reports. It never changes the page.

The tool this was modelled on — in the Bayit project — can also stage real edits: rewrite
text, swap an image, replace markup, and re-apply all of it on every page load so an
admin can preview live. That suits a marketing site being redrafted. It is left out here
on purpose. What is on screen in this Studio is somebody's family testimony, and a tool
that quietly rewrites the page underneath it would make a reviewer's note
indistinguishable from the record itself.

The reasoning is repeated in `app/src/features/report/reportStore.ts` so it is not lost
the next time someone extends this.
