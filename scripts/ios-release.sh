#!/usr/bin/env bash
# Build the iOS app on this Mac with EAS (`eas build --local`) and upload it
# straight to TestFlight with fastlane. No EAS cloud build, no EAS Submit queue.
#
#   npm run release:ios                     build + upload
#   npm run release:ios -- path/to/app.ipa  upload an existing .ipa only
#
# Still uses EAS for what it stores: production env vars, signing
# credentials and the remote build number (auto-incremented), so local and
# cloud builds never clash.
#
# One-time setup:
#   1. brew install fastlane
#   2. App Store Connect → Users and Access → Integrations → App Store Connect
#      API → generate a key with "App Manager" access, download the .p8
#      (only downloadable once). Keep it outside the repo, e.g. ~/.appstoreconnect/
#   3. Create .env.release.local in the repo root (gitignored):
#        ASC_KEY_ID=XXXXXXXXXX
#        ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#        ASC_KEY_PATH=/Users/you/.appstoreconnect/AuthKey_XXXXXXXXXX.p8
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.release.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. See the setup steps at the top of scripts/ios-release.sh." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for var in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
  if [ -z "${!var:-}" ]; then
    echo "$var is not set in $ENV_FILE." >&2
    exit 1
  fi
done
if [ ! -f "$ASC_KEY_PATH" ]; then
  echo "API key file not found: $ASC_KEY_PATH" >&2
  exit 1
fi
if ! command -v fastlane >/dev/null 2>&1; then
  echo "fastlane is not installed. Run: brew install fastlane" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  IPA="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  [ -f "$IPA" ] || { echo "No such file: $1" >&2; exit 1; }
  echo "Uploading existing build: $IPA"
else
  mkdir -p build
  IPA="$PWD/build/elpuls-$(date +%Y%m%d-%H%M).ipa"
  echo "Building locally with EAS → $IPA"
  npx eas-cli build --platform ios --profile production --local --non-interactive --output "$IPA"
fi

fastlane ios upload ipa:"$IPA"
echo "Uploaded. It shows up in TestFlight once Apple has processed it (usually 5-30 min)."
