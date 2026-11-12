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

Deployed by `.github/workflows/website.yml` using the Vercel CLI. Settings live in `vercel.json` (Vite,
yarn, `dist/`, SPA rewrite so `/privacy` works on refresh). Vercel's own Git auto-deploy is disabled there,
so GitHub Actions is the only thing that deploys: every push to `main` deploys to production.

The Vercel project's Root Directory is `website` (set in the dashboard); the workflow runs the CLI from the
repo root. Repo secrets required: `VERCEL_TOKEN`, `VERCEL_ORG_ID` (Team ID), `VERCEL_PROJECT_ID`.

## Before going live

- The phone screenshots on the home page (`src/pages/Home.tsx`, `public/screenshots/`) are real Simulator
  captures. Replace them with screenshots from a real device or a production build before launch, and re-crop
  if the app's UI changes.
- The Privacy Policy (`src/pages/Privacy.tsx`) has several `placeholder`-styled items (amber text) that need
  real values: your legal name, a real contact email, and a lawyer's review before publishing. It's ported
  from the fuller draft at https://claude.ai/artifact/D3FNoLC54UPgp1xkLPCQgk — keep both in sync if you edit
  either.
- Update the "coming soon" App Store/Play Store badges once the app is actually submitted.
