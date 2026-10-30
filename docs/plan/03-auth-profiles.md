# Auth & Personal Profiles

## Why this is Phase 0, not a later add-on

The stated purpose is to help the Zikaron BaSalon team know who they're dealing with — a family member, a host, or staff — before any collection or presentation work starts. That means profile data has to exist before the wizards do anything meaningful.

## Sign-in

Firebase Authentication, two methods to start:
- Google sign-in (also the natural lead-in to Google Drive access)
- Email link (no password) — for people without a Google account

## Profile (Firestore `users/{uid}`)

```
displayName
email
role: "family" | "host" | "staff"        — self-selected at first sign-in, editable by staff
languagePreference: "en" | "he"
relationshipNote?: string                 — free text, e.g. "granddaughter of Yosef Rosen"
createdAt, lastActiveAt
```

Kept intentionally small for Phase 0/1: enough for staff to know who someone is and how to address them, not a full CRM. Expanding it (phone number, org affiliation, consent records) is a deliberate later decision tied to the still-open consent/privacy question, not something to guess at now.

## Access model, Phase 0/1

- A `story` document has one `ownerUid` (the family member or host who started it).
- Staff accounts (`role: "staff"`) can read any story for review purposes — this is the seed of the "human review" requirement, not full admin tooling.
- No sharing/collaboration between family members yet (e.g. two siblings co-editing one story) — single-owner per story until that need is confirmed.
