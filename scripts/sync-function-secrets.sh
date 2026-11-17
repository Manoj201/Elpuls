#!/usr/bin/env bash
# Copies Cloud Functions secrets from GitHub Actions secrets into Firebase
# (Google Secret Manager) before a deploy. Used by deploy-firebase.yml and
# deploy-production.yml.
#
# For each NAME below: if the env var NAME is set (from a GitHub secret) and
# differs from what Firebase already has, a new version is saved. Unchanged
# values are left alone, so repeat deploys don't pile up secret versions.
# A secret that isn't set in GitHub is skipped (it may have been set by hand).
set -euo pipefail

SECRETS=(REVENUECAT_SECRET_KEY REVENUECAT_WEBHOOK_AUTH)
FIREBASE="npx --yes firebase-tools@latest"
PROJECT="elpuls"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

for name in "${SECRETS[@]}"; do
  value="${!name:-}"
  if [ -z "$value" ]; then
    echo "$name: not set in GitHub secrets, skipping."
    continue
  fi
  current="$($FIREBASE functions:secrets:access "$name" --project "$PROJECT" 2>/dev/null || true)"
  if [ "$current" = "$value" ]; then
    echo "$name: unchanged."
    continue
  fi
  printf '%s' "$value" > "$tmp"
  $FIREBASE functions:secrets:set "$name" --data-file "$tmp" --project "$PROJECT" --non-interactive --force
  echo "$name: updated."
done
