# Security

## Reporting a vulnerability

Email **liorp@memorial-project.org** rather than opening a public issue. Please include
what you found, how to reproduce it, and what it would let someone do.

This project holds Holocaust survivor testimony. A disclosure that exposes a family's
material matters more here than a disclosure that exposes a bug, so please give us a
chance to fix it before publishing.

## What is and is not in this repository

**Not here, and never should be:**

- API keys and secrets — they live in `.env.local` files, which are gitignored. The
  tracked `.env.example` files are templates with no values.
- Service-account JSON, certificates, private keys — gitignored by pattern, wherever
  they land in the tree.
- Any family's materials, and any `*.sqlite` catalog.
- Survivor testimony video under `resources/stories/` — third-party, rights-restricted.

**Here, and public by design:**

- The Firebase **web** API key, in a deployed bundle. This key identifies the project to
  Firebase; it is not a credential. Access is controlled by Firebase Auth and Firestore
  security rules, not by keeping this value secret. Google documents it as public.

## Where the real boundary is

The app is deliberately built so that a family's material never reaches a server:

- Files are read from a folder the person picks, through the File System Access API.
- Metadata is written to `zikaron-metadata.sqlite` **in that same folder**, beside the
  materials — not to a database we hold.
- Export produces a local archive. Import reads one. Neither goes through us.

The AI actions are the one exception, and they are explicit: text is sent to a model
provider when the person presses a button that says so. Nothing is sent in the
background, and the feature is absent entirely when the Functions backend is not
deployed.

## If a key is ever committed

Rotating beats reverting. A value that reached a public repository should be treated as
public from that moment, even after a force-push, because clones and caches outlive the
history rewrite.

1. Rotate the key at the provider.
2. Set the new value as a Firebase secret:
   `firebase functions:secrets:set GEMINI_API_KEY`
3. Then clean the history, if it is still worth doing.

## Checking before you push

```bash
git diff --cached --name-only        # what is actually staged
grep -rIn 'AIza[0-9A-Za-z_-]\{30,\}' . --exclude-dir=node_modules --exclude-dir=.git
```

A `.env` file appearing in the first command is a bug in the ignore rules, not a reason
to commit it.
