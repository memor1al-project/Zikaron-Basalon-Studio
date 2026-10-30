# Zikaron BaSalon Story Studio — app

Phase 0/1 implementation. See `../docs/plan/` for the design behind this.

## Setup

```
cp .env.example .env.local   # fill in from Firebase console + Google Cloud console
npm install
npm run dev
```

## Status

- Auth (Google + email link), profile gate, local-file storage provider: working
- Google Drive provider: stubbed, needs OAuth client ID + Picker wiring
- Guided interview, review gate: not built yet — see `docs/plan/04-roadmap.md`
