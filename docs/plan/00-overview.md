# Phase 0/1 Implementation Plan — Overview

**Goal:** move from static mockups to a real, incrementally testable app for the Collection Wizard and Presentation Wizard.

## First use cases (in build order)

1. **Account + profile** — a person signs in and has a profile the team can use to know who they are (family member, host, or Zikaron BaSalon staff) before any testimony work starts.
2. **Connect a storage location** — link a local folder or a Google Drive folder as the place materials live, per project/story.
3. **Collection: upload + list materials** — bring files in from the connected storage, see them as a tagged grid. No AI yet.
4. **Collection: guided interview** — answer the three category prompts (Life Before the War / The War Period / A Message for Today) and save answers against the story.
5. **Human review gate** — everything collected sits in a "needs review" state until a person marks it reviewed. This exists from day one, not bolted on later.

AI features (suggested connections, historical context, narrative drafting) are explicitly **out of scope** for this first build — they need the storage + data model to exist first, and are their own phase.

## Related documents

- [Architecture](01-architecture.md) — stack choices and why
- [Storage abstraction](02-storage-abstraction.md) — local filesystem + Google Drive as pluggable providers
- [Auth & profiles](03-auth-profiles.md) — who signs in, what a profile holds
- [Roadmap](04-roadmap.md) — task-level breakdown for what's being built now
- [AI skills catalog](05-ai-skills-catalog.md) — visual/textual AI capabilities already working in the sibling `website` codebase, to reuse for the next-phase AI work
- [Functional description](06-functional-description.md) — what the app actually does today, feature by feature

## Out of scope for now (see [[project_open_items]] in memory)

- Consent/privacy flows for real testimony data — nothing here touches real survivor data until that's resolved.
- Final editorial authority rules — the review gate exists, but who has override power is not decided.
