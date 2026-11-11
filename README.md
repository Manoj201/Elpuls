# Elpuls

Smart electricity price app for Sweden. See [CLAUDE.md](./CLAUDE.md) for the full project plan.

## Setup

```bash
nvm use            # Node 24.20.0, see .nvmrc
yarn install
cp .env.example .env   # fill in Firebase config, see below
```

## Running the app

```bash
yarn start          # Metro bundler; press i/a/w for iOS/Android/web
yarn typecheck       # tsc --noEmit
```

## Firebase setup

This repo is not yet linked to a real Firebase project.

1. Create a project at https://console.firebase.google.com
2. Enable Authentication (Apple + Email providers), Firestore, and Cloud Messaging
3. Register a Web app in the project and copy its config into `.env` (see `.env.example`)
4. Replace the placeholder project id in `.firebaserc` with your project id
5. `firebase login` then `firebase deploy --only firestore:rules,firestore:indexes` to publish security rules

## Cloud Functions

```bash
cd functions
yarn install
yarn typecheck
yarn serve          # run against the Firebase emulator suite
```

Two scheduled functions live here:

- `fetchPrices` — polls elprisetjustnu.se for tomorrow's SE1-SE4 spot prices around their ~13:00 CET publish time and caches them in Firestore (`prices/{SE-ZONE-YYYY-MM-DD}`)
- `fetchWeather` — pulls SMHI's forecast a few times a day for one reference point per price zone and caches it in Firestore (`weather/{SE-ZONE}`)

Never test against production data — use the Firebase Emulator Suite (`firebase emulators:start`) for local Firestore/Functions development.

## Project structure

```
src/
  config/countries/   # CountryConfig per country (SE now, NO planned) + registry
  providers/           # PriceProvider / WeatherProvider adapter interfaces + implementations
  stores/               # Zustand stores — screens read/write these, never call providers directly
  lib/firebase.ts       # Firebase client SDK init
functions/               # Firebase Cloud Functions (scheduled price/weather fetch)
```

Adding a new country (e.g. Norway) means adding a new `CountryConfig` + provider implementations under `src/config/countries` and `src/providers` — no changes to screens or stores.

## Data sources

- Prices: [elprisetjustnu.se](https://www.elprisetjustnu.se) — no API key, 15-minute interval prices per SE1-SE4 zone
- Weather: [SMHI open data](https://opendata.smhi.se) — no API key. Uses the `snow1g` forecast category (the previous `pmp3g` category was deprecated 2026-03-31)
