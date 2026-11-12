# Elpuls website

A simple marketing landing page + hosted Privacy Policy, built with React + TypeScript + Vite. Separate from
the Expo app and Cloud Functions — nothing here ships inside the mobile app.

## Develop

```bash
npm install
npm run dev
```

## Build for deployment

```bash
npm run build
```

Outputs a fully static site to `dist/` — plain HTML/CSS/JS, no server required.

## Deployment (Vercel)

Deployed by Vercel's GitHub integration (no GitHub Actions workflow): every push to `main` deploys to
production, other branches get preview deploys. The Vercel project's Root Directory is `website`. Build
settings live in `vercel.json` (Vite, yarn, `dist/`, SPA rewrite so `/privacy` works on refresh).

## Before going live

- The phone screenshots on the home page (`src/pages/Home.tsx`, `public/screenshots/`) are real Simulator
  captures. Replace them with screenshots from a real device or a production build before launch, and re-crop
  if the app's UI changes.
- The Privacy Policy (`src/pages/Privacy.tsx`) has several `placeholder`-styled items (amber text) that need
  real values: your legal name, a real contact email, and a lawyer's review before publishing. It's ported
  from the fuller draft at https://claude.ai/artifact/D3FNoLC54UPgp1xkLPCQgk — keep both in sync if you edit
  either.
- Update the "coming soon" App Store/Play Store badges once the app is actually submitted.
